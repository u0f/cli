package cmd

// Fork: signed self-update from this fork's GitHub releases. Nothing is installed unless
// SHA256SUMS carries a valid Ed25519 signature from the release key and the archive
// matches its hash in that file.

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"time"

	"github.com/spicetify/cli/src/utils"
)

const (
	releaseRepo = "u0f/cli"
	// Public half of the key that signs SHA256SUMS in .github/workflows/release.yml.
	updatePublicKey     = "zjr+/zijDPcKd95GmuiNOlTsm1sgmUeS8dfEAD4EQGU="
	updateCheckInterval = 24 * time.Hour
	maxArchiveSize      = 100 << 20
)

type releaseAsset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}

type latestRelease struct {
	TagName string         `json:"tag_name"`
	Assets  []releaseAsset `json:"assets"`
}

var updateClient = &http.Client{Timeout: 2 * time.Minute}

// AutoUpdate runs Update at most once per updateCheckInterval, unless auto_update is off
// or this process is already the freshly installed binary.
func AutoUpdate(version string) {
	if os.Getenv("SPICETIFY_UPDATED") != "" || !settingSection.Key("auto_update").MustBool(true) {
		return
	}
	last, _ := time.Parse(time.RFC3339, settingSection.Key("last_update_check").String())
	if time.Since(last) < updateCheckInterval {
		return
	}
	settingSection.Key("last_update_check").SetValue(time.Now().UTC().Format(time.RFC3339))
	if err := cfg.Write(); err != nil {
		utils.PrintWarning("Failed to save config: " + err.Error())
	}
	Update(version)
}

// Update installs the latest release when it differs from version, then runs the new
// binary as "auto" with the same flags so Spotify is re-applied, and exits with its code.
func Update(version string) {
	exe, err := os.Executable()
	if err == nil {
		exe, err = filepath.EvalSymlinks(exe)
	}
	if err != nil {
		utils.PrintWarning("Cannot locate spicetify executable: " + err.Error())
		return
	}
	utils.CheckExistAndDelete(exe + ".old")

	if version == "" || version == "Dev" {
		utils.PrintInfo("Development build; not checking for updates")
		return
	}

	release, err := fetchLatestRelease()
	if err != nil {
		utils.PrintWarning("Cannot check for updates: " + err.Error())
		return
	}
	latest := strings.TrimPrefix(release.TagName, "v")
	if latest == version {
		utils.PrintSuccess("spicetify is up to date (v" + version + ")")
		return
	}

	utils.PrintInfo("Updating spicetify v" + version + " -> v" + latest)
	archive, err := downloadVerifiedArchive(release, latest)
	if err != nil {
		utils.PrintError("Update aborted, nothing was changed: " + err.Error())
		return
	}
	if err := installArchive(exe, archive); err != nil {
		utils.PrintError("Update failed, previous version kept: " + err.Error())
		return
	}
	utils.PrintSuccess("Installed spicetify v" + latest)

	args := slices.Clone(os.Args[1:])
	for i, arg := range args {
		if arg == "update" {
			args[i] = "auto"
		}
	}
	next := exec.Command(exe, args...)
	next.Env = append(os.Environ(), "SPICETIFY_UPDATED=1")
	next.Stdin, next.Stdout, next.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := next.Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			os.Exit(exitErr.ExitCode())
		}
		utils.Fatal(err)
	}
	os.Exit(0)
}

func fetchLatestRelease() (*latestRelease, error) {
	body, err := download("https://api.github.com/repos/"+releaseRepo+"/releases/latest", 1<<20)
	if err != nil {
		return nil, err
	}
	var release latestRelease
	if err := json.Unmarshal(body, &release); err != nil {
		return nil, err
	}
	if release.TagName == "" {
		return nil, errors.New("no release found")
	}
	return &release, nil
}

// downloadVerifiedArchive returns the archive for this platform once SHA256SUMS is proven
// to be signed by the release key and the archive matches the hash listed in it.
func downloadVerifiedArchive(release *latestRelease, version string) ([]byte, error) {
	ext := "tar.gz"
	if runtime.GOOS == "windows" {
		ext = "zip"
	}
	name := fmt.Sprintf("spicetify-%s-%s-%s.%s", version, runtime.GOOS, runtime.GOARCH, ext)

	urls := map[string]string{}
	for _, asset := range release.Assets {
		urls[asset.Name] = asset.URL
	}
	for _, required := range []string{name, "SHA256SUMS", "SHA256SUMS.sig"} {
		if urls[required] == "" {
			return nil, fmt.Errorf("release has no %s", required)
		}
	}

	sums, err := download(urls["SHA256SUMS"], 1<<20)
	if err != nil {
		return nil, err
	}
	sig, err := download(urls["SHA256SUMS.sig"], 1<<10)
	if err != nil {
		return nil, err
	}
	if err := verifySignature(sums, sig); err != nil {
		return nil, err
	}

	expected := ""
	scanner := bufio.NewScanner(bytes.NewReader(sums))
	for scanner.Scan() {
		if fields := strings.Fields(scanner.Text()); len(fields) == 2 && strings.TrimPrefix(fields[1], "*") == name {
			expected = fields[0]
		}
	}
	if expected == "" {
		return nil, fmt.Errorf("%s is not listed in SHA256SUMS", name)
	}

	archive, err := download(urls[name], maxArchiveSize)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(archive)
	if hex.EncodeToString(sum[:]) != strings.ToLower(expected) {
		return nil, fmt.Errorf("%s does not match its SHA256SUMS hash", name)
	}
	return archive, nil
}

func verifySignature(message, signature []byte) error {
	key, err := base64.StdEncoding.DecodeString(updatePublicKey)
	if err != nil || len(key) != ed25519.PublicKeySize {
		return errors.New("invalid built-in update key")
	}
	sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(signature)))
	if err != nil || !ed25519.Verify(ed25519.PublicKey(key), message, sig) {
		return errors.New("SHA256SUMS signature is not valid")
	}
	return nil
}

func download(url string, limit int64) ([]byte, error) {
	resp, err := updateClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: HTTP %s", url, resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > limit {
		return nil, fmt.Errorf("%s is larger than expected", url)
	}
	return body, nil
}

// installArchive moves the running executable aside (allowed on Windows too), extracts the
// archive over its folder and puts the old executable back if anything fails.
func installArchive(exe string, archive []byte) error {
	dir := filepath.Dir(exe)
	old := exe + ".old"
	if err := os.Rename(exe, old); err != nil {
		return err
	}

	var err error
	if runtime.GOOS == "windows" {
		var tmp *os.File
		if tmp, err = os.CreateTemp("", "spicetify-update-*.zip"); err == nil {
			_, err = tmp.Write(archive)
			tmp.Close()
			if err == nil {
				err = utils.Unzip(tmp.Name(), dir)
			}
			os.Remove(tmp.Name())
		}
	} else {
		err = extractTarGz(archive, dir)
	}
	if err == nil {
		_, err = os.Stat(exe)
	}
	if err != nil {
		os.Remove(exe)
		os.Rename(old, exe)
		return err
	}
	return nil
}

func extractTarGz(archive []byte, dest string) error {
	gz, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return err
	}
	reader := tar.NewReader(gz)
	for {
		header, err := reader.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		name := filepath.Clean(header.Name)
		if name == "." {
			continue
		}
		if !filepath.IsLocal(name) {
			return fmt.Errorf("illegal file path in archive: %s", header.Name)
		}
		target := filepath.Join(dest, name)
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			file, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, os.FileMode(header.Mode)&0755)
			if err != nil {
				return err
			}
			_, err = io.Copy(file, io.LimitReader(reader, maxArchiveSize))
			file.Close()
			if err != nil {
				return err
			}
		}
	}
}
