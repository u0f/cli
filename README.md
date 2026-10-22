# Spicetify (fork personal)

Fork recortado y endurecido de [spicetify/cli](https://github.com/spicetify/cli), la herramienta que modifica el cliente de escritorio de Spotify para inyectarle temas, extensiones y apps.

Objetivo: lo justo para personalizar Spotify, **sin descargas ni código remoto** y con todo lo que se ejecuta dentro del cliente revisado y fijado en el repositorio.

## Qué cambia respecto al original

**Quitado**

- Auto-actualización (`spicetify update`) y aviso de nuevas versiones: descargaban y reemplazaban el ejecutable sin verificar firma ni checksum.
- Descarga del mapa CSS desde GitHub en cada `apply`: se usa siempre el `css-map.json` local.
- Instaladores (`install.ps1` / `install.sh`) y la instalación de Marketplace, que ejecutaba un script remoto con `iex`.
- Custom apps `reddit` y `new-releases`, CI y ficheros de mantenimiento del proyecto original.
- En `lyrics-plus`: el proveedor Netease (pasaba por un mirror de un particular) y las librerías que se cargaban en tiempo de ejecución desde jsDelivr (romanización y conversión de chino, japonés y coreano).

**Endurecido**

- Proxy CORS de terceros (`cors-proxy.spicetify.app`) desactivado por defecto. Solo se usa si configuras tú uno en `localStorage["spicetify:corsProxyTemplate"]`.
- `spicetify watch` abre el puerto de depuración aceptando solo el origen `http://localhost`, no `*`.

**Añadido** (activas por defecto)

- `adblock.js`: [Adblockify](https://github.com/rxri/spicetify-extensions/tree/main/adblock) de ririxi (MIT), generado desde su código TypeScript revisado en el commit `5da6cf1`. Solo usa APIs internas de Spotify; no hace peticiones externas.
- `geniusButton.js`: abre en Genius la canción o el álbum (ver abajo).
- `coverArt.js`: clic derecho (o tres puntos) en una canción, álbum, artista, playlist, podcast, episodio o perfil → *Abrir imagen en máxima calidad*. Abre la portada o foto en el navegador, desde donde puedes guardarla. Pide a la CDN la variante más grande que existe: 2000 px en portadas de álbum, 1280 px en mosaicos de playlist y 640 px en artistas y podcasts (más no existe).
- Menú de perfil → **Extensiones**: interruptores para activar o desactivar cada extensión instalada sin usar la terminal. El cambio se aplica al recargar Spotify (botón *Recargar ahora*).

Resultado: el binario solo hace peticiones de red a `localhost` (en modo `watch`).

## Extensión Genius

- **Botón en la barra del reproductor**, junto al de letras: abre la página de Genius de la canción que suena.
- **Menú de los tres puntos** (o clic derecho) de una canción o un álbum: opción *Buscar en Genius*. Los singles van a la página de la canción, porque Genius no tiene página de álbum para ellos.

Cómo funciona: Spotify no puede consultar la API de Genius (no envía cabeceras CORS), así que la extensión no hace ninguna petición. Abre en tu navegador una búsqueda de DuckDuckGo con el prefijo `\` ("voy a tener suerte") limitada a `genius.com`, que lleva directamente al primer resultado. DuckDuckGo recibe el nombre del artista y la canción; nada más.

## Requisitos

- Spotify de escritorio descargado de [spotify.com/download](https://www.spotify.com/download). **No sirve la versión de Microsoft Store**: está en `WindowsApps` y no se puede modificar.
- [Go](https://go.dev/dl/) 1.26 o superior y [Node.js](https://nodejs.org/) 18 o superior con pnpm (`corepack enable`).
- Ejecutar `spicetify` **sin permisos de administrador**. Si no, Spotify queda con la ventana en negro.

## Compilar

```bash
pnpm install --frozen-lockfile
pnpm build:wrapper
go build -ldflags "-X main.version=2.0.0-fork" -o spicetify.exe
```

En Linux o macOS, usa `-o spicetify`. El ejecutable tiene que quedarse en esta carpeta, junto a `Extensions/`, `CustomApps/`, `Themes/`, `jsHelper/` y `css-map.json`.

## Usar

Abre Spotify una vez, inicia sesión, ciérralo y ejecuta:

```bash
./spicetify.exe backup apply
```

Para comprobar que está activo, abre el menú de tu perfil en Spotify: debe aparecer *Experimental features*.

Otros comandos habituales:

| Comando | Para qué |
| --- | --- |
| `spicetify config extensions nombre.js` | Instalar una extensión (`nombre.js-` la quita). Para apagarla sin quitarla, usa el menú *Extensiones* del perfil |
| `spicetify config custom_apps lyrics-plus` | Activar una custom app |
| `spicetify apply` | Aplicar cambios de configuración |
| `spicetify refresh -e` | Recargar solo las extensiones |
| `spicetify restore` | Devolver Spotify a su estado original |
| `spicetify -c` | Mostrar la ruta del fichero de configuración |

**Cuando Spotify se actualiza** borra los cambios. Vuelve a ejecutar `spicetify backup apply`.

## Mantenimiento

Al no tener auto-update, las correcciones para nuevas versiones de Spotify hay que traerlas a mano desde el proyecto original:

```bash
git remote add upstream https://github.com/spicetify/cli.git
git fetch upstream
git merge upstream/main
```

Revisa el diff antes de compilar, sobre todo `src/preprocess/`, `src/jsHelper/` y `css-map.json`. `pnpm css-map:update` ayuda a regenerar el mapa CSS entre dos versiones de Spotify.

Si Spotify rompe el adblock, regenera `Extensions/adblock.js` desde el repo de rxri y revisa su diff.

## Limitaciones conocidas

- `lyrics-plus`: sin proxy CORS no funcionan Musixmatch ni Genius; quedan Spotify y LRCLIB. Las opciones de romanización y conversión siguen en el menú, pero devuelven el texto sin cambios.
- `popupLyrics.js` (desactivada por defecto) todavía usa Netease.
- Toda extensión o tema se ejecuta con acceso a tu sesión de Spotify. Instala solo código que hayas leído.
- Saltarse los anuncios va contra los términos de uso de Spotify.

## Licencia

LGPL-2.1, como el proyecto original. Las extensiones `geniusButton.js` y `coverArt.js` son propias de este fork. Adblockify es MIT y el logo de Genius viene de [Simple Icons](https://simpleicons.org/) (CC0).
