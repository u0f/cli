// Fork: profile menu entry to pick a theme and color scheme without the CLI.
// apply writes every bundled theme to xpui/themes (see BundleThemes in apply.go); the choice
// is stored in localStorage and the inline script in index.html applies it on load.
// Themes added from this menu are kept in USER_KEY (user.css plus color.ini converted to CSS).
const STORAGE_KEY = "spicetify:theme";
const USER_KEY = "spicetify:user-themes";

const readJSON = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const STYLE = `
.spicetify-theme-settings .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; }
.spicetify-theme-settings select, .spicetify-theme-settings input { min-width: 220px; }
.spicetify-theme-settings .hint { margin-top: 12px; color: var(--spice-subtext); }
.spicetify-theme-settings h3 { margin-top: 24px; }
.spicetify-theme-settings button { margin-top: 12px; margin-right: 8px; padding: 6px 16px; border: 1px solid #727272; border-radius: 500px;
  background: transparent; color: var(--spice-text); font-weight: 700; cursor: pointer; }
.spicetify-theme-settings .row button { margin: 0; font-weight: 400; color: var(--spice-subtext); }
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
        userTag: "(añadido)",
        added: "Temas añadidos",
        name: "Nombre del tema",
        add: "Añadir tema",
        remove: "Quitar",
        addHint:
          "Elige el user.css del tema y, si lo tiene, su color.ini (puedes seleccionar los dos a la vez). Los temas añadidos no han sido revisados y su CSS puede cargar recursos de internet; los añades bajo tu responsabilidad.",
        needName: "Escribe un nombre para el tema.",
        needCSS: "Falta el archivo user.css.",
        exists: "Ya hay un tema incluido con ese nombre.",
        tooBig: "No se pudo guardar: los archivos son demasiado grandes.",
      }
    : {
        title: "Themes",
        theme: "Theme",
        scheme: "Color scheme",
        none: "Default (config)",
        hint: "Applies after reloading Spotify.",
        apply: "Apply and reload",
        failed: "No themes found. Run spicetify apply.",
        userTag: "(added)",
        added: "Added themes",
        name: "Theme name",
        add: "Add theme",
        remove: "Remove",
        addHint:
          "Pick the theme's user.css and, if it has one, its color.ini (you can select both at once). Added themes have not been reviewed and their CSS may load resources from the internet; you add them at your own risk.",
        needName: "Enter a name for the theme.",
        needCSS: "The user.css file is missing.",
        exists: "A bundled theme already has that name.",
        tooBig: "Could not save: the files are too large.",
      };
}

// Same output as getColorCSS in apply.go, for the keys the scheme defines; the rest fall back
// to the colors.css already loaded.
function parseColorIni(source) {
  const schemes = [];
  let current;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const section = line.match(/^\[(.+)\]$/);
    if (section) {
      current = { name: section[1].trim(), vars: [] };
      schemes.push(current);
      continue;
    }
    const pair = line.match(/^([\w-]+)\s*=\s*#?([0-9a-f]{6}|[0-9a-f]{3})\b/i);
    if (!current || !pair) continue;
    const hex = pair[2].length === 3 ? [...pair[2]].map((c) => c + c).join("") : pair[2];
    const rgb = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(",");
    current.vars.push(`    --spice-${pair[1]}: #${hex};`, `    --spice-rgb-${pair[1]}: ${rgb};`);
  }
  return schemes.map((s) => ({ name: s.name, css: `:root {\n${s.vars.join("\n")}\n}\n` }));
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

function createButton(label, onclick) {
  const button = document.createElement("button");
  button.textContent = label;
  button.onclick = onclick;
  return button;
}

function addTheme(text, name, bundled, render) {
  if (!name) return Spicetify.showNotification?.(text.needName, true);
  if (bundled.some((t) => t.name === name)) return Spicetify.showNotification?.(text.exists, true);
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".css,.ini";
  input.multiple = true;
  input.onchange = async () => {
    const files = [...(input.files ?? [])];
    const css = files.find((f) => f.name.toLowerCase().endsWith(".css"));
    if (!css) return Spicetify.showNotification?.(text.needCSS, true);
    const ini = files.find((f) => f.name.toLowerCase().endsWith(".ini"));
    let schemes = ini ? parseColorIni(await ini.text()) : [];
    if (schemes.length === 0) schemes = [{ name: "default", css: "" }];
    const user = readJSON(USER_KEY, []).filter((t) => t.name !== name);
    user.push({ name, css: await css.text(), schemes });
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      return Spicetify.showNotification?.(text.tooBig, true);
    }
    render();
  };
  input.click();
}

async function buildContent(text) {
  const content = document.createElement("div");
  content.className = "spicetify-theme-settings";

  let bundled;
  try {
    bundled = await (await fetch("themes/index.json")).json();
  } catch {
    bundled = [];
  }
  if (!Array.isArray(bundled)) bundled = [];

  const render = () => {
    const style = document.createElement("style");
    style.textContent = STYLE;
    content.replaceChildren(style);

    const userThemes = readJSON(USER_KEY, []);
    const themes = [
      ...bundled.map((t) => ({ name: t.name, label: t.name, schemes: t.schemes.map((s) => [s.file, s.name]) })),
      ...userThemes.map((t) => ({
        name: t.name,
        label: `${t.name} ${text.userTag}`,
        user: true,
        schemes: t.schemes.map((s) => [s.name, s.name]),
      })),
    ];
    // Option values carry the origin so a bundled and an added theme never collide.
    const key = (t) => (t.user ? "user:" : "bundled:") + t.name;

    if (themes.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = text.failed;
      content.appendChild(empty);
    } else {
      const choice = readJSON(STORAGE_KEY, null);
      const chosen = choice ? (choice.user ? "user:" : "bundled:") + choice.theme : "";
      const themeSelect = createSelect([["", text.none], ...themes.map((t) => [key(t), t.label])], chosen);
      const schemeRow = createRow(text.scheme, document.createElement("select"));

      const updateSchemes = () => {
        const theme = themes.find((t) => key(t) === themeSelect.value);
        const schemeSelect = createSelect(theme?.schemes ?? [], chosen === themeSelect.value ? choice?.scheme : undefined);
        schemeRow.lastChild.replaceWith(schemeSelect);
        schemeRow.style.display = theme ? "" : "none";
      };
      themeSelect.onchange = updateSchemes;
      updateSchemes();

      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = text.hint;
      const apply = createButton(text.apply, () => {
        const theme = themes.find((t) => key(t) === themeSelect.value);
        if (theme) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ theme: theme.name, scheme: schemeRow.lastChild.value, ...(theme.user && { user: true }) }),
          );
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
        location.reload();
      });
      content.append(createRow(text.theme, themeSelect), schemeRow, hint, apply);
    }

    const heading = document.createElement("h3");
    heading.textContent = text.added;
    content.appendChild(heading);
    for (const theme of userThemes) {
      content.appendChild(
        createRow(
          theme.name,
          createButton(text.remove, () => {
            localStorage.setItem(USER_KEY, JSON.stringify(readJSON(USER_KEY, []).filter((t) => t.name !== theme.name)));
            // Deferred: removing the clicked button mid-click makes the modal treat it as an outside click.
            setTimeout(render);
          }),
        ),
      );
    }
    const nameInput = document.createElement("input");
    nameInput.className = "main-dropDown-dropDown";
    nameInput.placeholder = text.name;
    const addHint = document.createElement("p");
    addHint.className = "hint";
    addHint.textContent = text.addHint;
    content.append(
      createRow(text.name, nameInput),
      addHint,
      createButton(text.add, () => addTheme(text, nameInput.value.trim(), bundled, render)),
    );
  };

  render();
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
