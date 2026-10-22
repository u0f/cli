// Fork: profile menu entry to switch installed extensions on or off without the CLI.
// The extension loader written into index.html by apply.go skips the names stored here.
const STORAGE_KEY = "spicetify:disabled-extensions";

const readDisabled = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const STYLE = `
.spicetify-extension-settings .row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; }
.spicetify-extension-settings button.switch { display: flex; padding: 8px; border: 0; border-radius: 50%; cursor: pointer;
  background-color: rgba(var(--spice-rgb-shadow), .7); color: var(--spice-text); }
.spicetify-extension-settings button.switch.disabled { color: rgba(var(--spice-rgb-text), .3); }
.spicetify-extension-settings .hint { margin-top: 12px; color: var(--spice-subtext); }
.spicetify-extension-settings button.reload { margin-top: 12px; padding: 6px 16px; border: 1px solid #727272; border-radius: 500px;
  background: transparent; color: var(--spice-text); font-weight: 700; cursor: pointer; }
`;

function getText() {
  return Spicetify.Locale?.getLocale?.().startsWith("es")
    ? {
        title: "Extensiones",
        empty: "No hay extensiones instaladas.",
        hint: "Los cambios se aplican al recargar Spotify.",
        reload: "Recargar ahora",
      }
    : {
        title: "Extensions",
        empty: "No extensions installed.",
        hint: "Changes apply after reloading Spotify.",
        reload: "Reload now",
      };
}

function buildContent(text) {
  const disabled = new Set(readDisabled());
  const content = document.createElement("div");
  content.className = "spicetify-extension-settings";
  const style = document.createElement("style");
  style.textContent = STYLE;
  content.appendChild(style);

  const extensions = Spicetify.Config?.extensions ?? [];
  if (extensions.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = text.empty;
    content.appendChild(empty);
    return content;
  }

  for (const name of extensions) {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = name.replace(/\.m?js$/, "");
    const toggle = document.createElement("button");
    toggle.className = "switch";
    toggle.setAttribute("aria-label", name);
    toggle.innerHTML = `<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">${Spicetify.SVGIcons.check}</svg>`;
    toggle.classList.toggle("disabled", disabled.has(name));
    toggle.onclick = () => {
      if (disabled.has(name)) disabled.delete(name);
      else disabled.add(name);
      toggle.classList.toggle("disabled", disabled.has(name));
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...disabled]));
    };
    row.append(label, toggle);
    content.appendChild(row);
  }

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = text.hint;
  const reload = document.createElement("button");
  reload.className = "reload";
  reload.textContent = text.reload;
  reload.onclick = () => location.reload();
  content.append(hint, reload);
  return content;
}

Spicetify.Events.webpackLoaded.on(() => {
  const text = getText();
  new Spicetify.Menu.Item(
    text.title,
    false,
    () => Spicetify.PopupModal.display({ title: text.title, content: buildContent(text) }),
    "grid-view",
  ).register();
});
