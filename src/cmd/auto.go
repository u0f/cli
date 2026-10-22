package cmd

import (
	"os"

	backupstatus "github.com/spicetify/cli/src/status/backup"
	spotifystatus "github.com/spicetify/cli/src/status/spotify"
)

// Auto checks Spotify state, re-backup and apply if needed, then launch
// Spotify client normally.
func Auto(spicetifyVersion string) {
	backupVersion := backupSection.Key("version").MustString("")
	spotStat := spotifystatus.Get(appPath)
	backStat := backupstatus.Get(prefsPath, backupFolder, backupVersion)

	if spotStat.IsBackupable() && (backStat.IsEmpty() || backStat.IsOutdated()) {
		Backup(spicetifyVersion, true)
		backupVersion := backupSection.Key("version").MustString("")
		backStat = backupstatus.Get(prefsPath, backupFolder, backupVersion)
	}

	if !backStat.IsBackuped() {
		os.Exit(1)
	}

	// Fork: after upgrading spicetify, Apply refuses a backup preprocessed by the old
	// version. Redo it the way "spicetify restore backup apply" would.
	if backupSection.Key("with").MustString("") != spicetifyVersion {
		Restore()
		Backup(spicetifyVersion, true)
		backStat = backupstatus.Get(prefsPath, backupFolder, backupSection.Key("version").MustString(""))
		spotStat = spotifystatus.Get(appPath)
	}

	if isAppX {
		spotStat = spotifystatus.Get(appDestPath)
	}

	if !spotStat.IsApplied() && backStat.IsBackuped() {
		CheckStates()
		InitSetting()
		Apply(spicetifyVersion)
	}
}
