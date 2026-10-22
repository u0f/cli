// Fork: profile menu entry to pick a theme and color scheme without the CLI.
// apply writes every bundled theme to xpui/themes (see BundleThemes in apply.go); the choice
// is stored in localStorage and the inline script in index.html applies it on load.
const STORAGE_KEY = "spicetify:theme";

const readChoice = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? null;
  } catch {
    return null;
  }
};

const STYLE = `
.spicetify-theme-settings .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; }
.spicetify-theme-settings select { min-width: 220px; }
.spicetify-theme-settings .hint { margin-top: 12px; color: var(--spice-subtext); }
.spicetify-theme-settings button.apply { margin-top: 12px; padding: 6px 16px; border: 1px solid #727272; border-radius: 500px;
  background: transparent; color: var(--spice-text); font-weight: 700; cursor: pointer; }
`;

function getText() {
  return Spicetify.Locale?.getLocale?.().startsWith("es")
    ? {
        title: "Temas",
        theme: "Tema",
        scheme: "Paleta de colores",
        none: "Por defecto (configuración)",
        hint: "Se aplica al recargar Spotify.",
        apply: "Aplicar y recargar",
        failed: "No se encontraron temas. Ejecuta spicetify apply.",
      }
    : {
        title: "Themes",
        theme: "Theme",
        scheme: "Color scheme",
        none: "Default (config)",
        hint: "Applies after reloading Spotify.",
        apply: "Apply and reload",
        failed: "No themes found. Run spicetify apply.",
      };
}

function createSelect(options, selected) {
  const select = document.createElement("select");
  select.className = "main-dropDown-dropDown";
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    select.appendChild(option);
  }
  return select;
}

function createRow(label, control) {
  const row = document.createElement("div");
  row.className = "row";
  const text = document.createElement("span");
  text.textContent = label;
  row.append(text, control);
  return row;
}

async function buildContent(text) {
  const content = document.createElement("div");
  content.className = "spicetify-theme-settings";
  const style = document.createElement("style");
  style.textContent = STYLE;
  content.appendChild(style);

  let themes;
  try {
    themes = await (await fetch("themes/index.json")).json();
  } catch {
    themes = [];
  }
  if (!Array.isArray(themes) || themes.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = text.failed;
    content.appendChild(empty);
    return content;
  }

  const choice = readChoice();
  const themeSelect = createSelect([["", text.none], ...themes.map((t) => [t.name, t.name])], choice?.theme ?? "");
  const schemeRow = createRow(text.scheme, document.createElement("select"));

  const updateSchemes = () => {
    const theme = themes.find((t) => t.name === themeSelect.value);
    const schemeSelect = createSelect(
      (theme?.schemes ?? []).map((s) => [s.file, s.name]),
      choice?.theme === theme?.name ? choice?.scheme : undefined,
    );
    schemeRow.lastChild.replaceWith(schemeSelect);
    schemeRow.style.display = theme ? "" : "none";
  };
  themeSelect.onchange = updateSchemes;
  updateSchemes();

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = text.hint;
  const apply = document.createElement("button");
  apply.className = "apply";
  apply.textContent = text.apply;
  apply.onclick = () => {
    if (themeSelect.value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: themeSelect.value, scheme: schemeRow.lastChild.value }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    location.reload();
  };

  content.append(createRow(text.theme, themeSelect), schemeRow, hint, apply);
  return content;
}

Spicetify.Events.webpackLoaded.on(() => {
  const text = getText();
  new Spicetify.Menu.Item(
    text.title,
    false,
    async () => Spicetify.PopupModal.display({ title: text.title, content: await buildContent(text) }),
    "brightness",
  ).register();
});
