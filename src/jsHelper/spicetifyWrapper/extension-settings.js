// Fork: profile menu entry to switch installed extensions on or off without the CLI.
// The extension loader written into index.html by apply.go skips the names stored here,
// and also runs the extensions the user added from this menu (USER_KEY, name + code).
const STORAGE_KEY = "spicetify:disabled-extensions";
const USER_KEY = "spicetify:user-extensions";

const readList = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const STYLE = `
.spicetify-extension-settings .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 0; }
.spicetify-extension-settings .row span { flex: 1; }
.spicetify-extension-settings button.switch { display: flex; padding: 8px; border: 0; border-radius: 50%; cursor: pointer;
  background-color: rgba(var(--spice-rgb-shadow), .7); color: var(--spice-text); }
.spicetify-extension-settings button.switch.disabled { color: rgba(var(--spice-rgb-text), .3); }
.spicetify-extension-settings button.remove { padding: 4px 12px; border: 1px solid #727272; border-radius: 500px; background: transparent;
  color: var(--spice-subtext); cursor: pointer; }
.spicetify-extension-settings .hint { margin-top: 12px; color: var(--spice-subtext); }
.spicetify-extension-settings button.reload, .spicetify-extension-settings button.add { margin-top: 12px; margin-right: 8px; padding: 6px 16px;
  border: 1px solid #727272; border-radius: 500px; background: transparent; color: var(--spice-text); font-weight: 700; cursor: pointer; }
`;

function getText() {
  return Spicetify.Locale?.getLocale?.().startsWith("es")
    ? {
        title: "Extensiones",
        empty: "No hay extensiones instaladas.",
        hint: "Los cambios se aplican al recargar Spotify.",
        reload: "Recargar ahora",
        add: "Añadir extensión",
        remove: "Quitar",
        warning:
          "Las extensiones añadidas (.js) se ejecutan dentro de Spotify con acceso a tu cuenta y no han sido revisadas. Añade solo las que vengan de una fuente de confianza; lo haces bajo tu responsabilidad.",
        exists: "Ya hay una extensión incluida con ese nombre.",
        tooBig: "No se pudo guardar: el archivo es demasiado grande.",
      }
    : {
        title: "Extensions",
        empty: "No extensions installed.",
        hint: "Changes apply after reloading Spotify.",
        reload: "Reload now",
        add: "Add extension",
        remove: "Remove",
        warning:
          "Added extensions (.js) run inside Spotify with access to your account and have not been reviewed. Only add ones from a source you trust; you do so at your own risk.",
        exists: "A bundled extension already has that name.",
        tooBig: "Could not save: the file is too large.",
      };
}

function createButton(className, label, onclick) {
  const button = document.createElement("button");
  button.className = className;
  button.textContent = label;
  button.onclick = onclick;
  return button;
}

function addExtension(text, render) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".js,.mjs";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if ((Spicetify.Config?.extensions ?? []).includes(file.name)) return Spicetify.showNotification?.(text.exists, true);
    const user = readList(USER_KEY).filter((ext) => ext.name !== file.name);
    user.push({ name: file.name, code: await file.text() });
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      return Spicetify.showNotification?.(text.tooBig, true);
    }
    render();
  };
  input.click();
}

function buildContent(text) {
  const content = document.createElement("div");
  content.className = "spicetify-extension-settings";

  const render = () => {
    const disabled = new Set(readList(STORAGE_KEY));
    const user = readList(USER_KEY).map((ext) => ext.name);
    const style = document.createElement("style");
    style.textContent = STYLE;
    content.replaceChildren(style);

    const extensions = [...(Spicetify.Config?.extensions ?? []), ...user];
    if (extensions.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = text.empty;
      content.appendChild(empty);
    }

    for (const name of extensions) {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("span");
      label.textContent = name.replace(/\.m?js$/, "");
      row.appendChild(label);
      if (user.includes(name)) {
        row.appendChild(
          createButton("remove", text.remove, () => {
            localStorage.setItem(USER_KEY, JSON.stringify(readList(USER_KEY).filter((ext) => ext.name !== name)));
            // Deferred: removing the clicked button mid-click makes the modal treat it as an outside click.
            setTimeout(render);
          }),
        );
      }
      const toggle = createButton("switch", "", () => {
        if (disabled.has(name)) disabled.delete(name);
        else disabled.add(name);
        toggle.classList.toggle("disabled", disabled.has(name));
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...disabled]));
      });
      toggle.setAttribute("aria-label", name);
      toggle.innerHTML = `<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">${Spicetify.SVGIcons.check}</svg>`;
      toggle.classList.toggle("disabled", disabled.has(name));
      row.appendChild(toggle);
      content.appendChild(row);
    }

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = text.hint;
    const warning = document.createElement("p");
    warning.className = "hint";
    warning.textContent = text.warning;
    content.append(
      hint,
      warning,
      createButton("add", text.add, () => addExtension(text, render)),
      createButton("reload", text.reload, () => location.reload()),
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
    () => Spicetify.PopupModal.display({ title: text.title, content: buildContent(text) }),
    "grid-view",
  ).register();
});
