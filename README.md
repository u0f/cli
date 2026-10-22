# Spicetify (fork personal)

Fork recortado y endurecido de [spicetify/cli](https://github.com/spicetify/cli), la herramienta que modifica el cliente de escritorio de Spotify para inyectarle temas, extensiones y apps.

Objetivo: lo justo para personalizar Spotify, **sin descargas ni código remoto** y con todo lo que se ejecuta dentro del cliente revisado y fijado en el repositorio.

## Qué cambia respecto al original

**Quitado**

- La auto-actualización y el aviso de versiones del original: descargaban y reemplazaban el ejecutable sin verificar firma ni checksum. Este fork tiene su propio `spicetify update`, firmado (ver *Actualizar*).
- Descarga del mapa CSS desde GitHub en cada `apply`: se usa siempre el `css-map.json` local.
- Instaladores (`install.ps1` / `install.sh`) y la instalación de Marketplace, que ejecutaba un script remoto con `iex`.
- Custom apps `reddit` y `new-releases`, CI y ficheros de mantenimiento del proyecto original.
- En `lyrics-plus`: el proveedor Netease (pasaba por un mirror de un particular) y las librerías que se cargaban en tiempo de ejecución desde jsDelivr (romanización y conversión de chino, japonés y coreano).

**Cambiado**

- `replace_colors` funciona también sin tema: los colores de Spotify pasan siempre por las variables `--spice-*` (con su paleta original por defecto), lo que permite cambiar de tema en caliente.

**Endurecido**

- Proxy CORS de terceros (`cors-proxy.spicetify.app`) desactivado por defecto. Solo se usa si configuras tú uno en `localStorage["spicetify:corsProxyTemplate"]`.
- `spicetify watch` abre el puerto de depuración aceptando solo el origen `http://localhost`, no `*`.

**Añadido** (activas por defecto)

- `adblock.js`: [Adblockify](https://github.com/rxri/spicetify-extensions/tree/main/adblock) de ririxi (MIT), generado desde su código TypeScript revisado en el commit `5da6cf1`. Solo usa APIs internas de Spotify; no hace peticiones externas.
- `geniusButton.js`: abre en Genius la canción, el álbum o el artista (ver abajo).
- `coverArt.js`: clic derecho (o tres puntos) en una canción, álbum, artista, playlist, podcast, episodio o perfil → *Abrir imagen en máxima calidad*. Abre la portada o foto en el navegador, desde donde puedes guardarla. Pide a la CDN la variante más grande que existe: 2000 px en portadas de álbum, 1280 px en mosaicos de playlist y 640 px en artistas y podcasts (más no existe).
- Menú de perfil → **Temas**: selector de tema y paleta de colores, sin terminal. Incluye los temas solo-CSS de [spicetify-themes](https://github.com/spicetify/spicetify-themes) (MIT): Blossom, BurntSienna, Dreary, Flow, Matte, Nightlight, Onepunch, SharkBlue, Sleek, Ziro y text, además de SpicetifyDefault. Se les quitaron los `@import` de Google Fonts para que no carguen nada de internet; los que tienen JavaScript (Dribbblish, StarryNight, Turntable) no se incluyen. Cualquier tema que añadas a `Themes/` o a la carpeta `Themes` de tu configuración aparece también en el selector tras `spicetify apply`. La elección es por usuario de Spotify y se aplica al recargar.
- Menú de perfil → **Extensiones**: interruptores para activar o desactivar cada extensión instalada sin usar la terminal. El cambio se aplica al recargar Spotify (botón *Recargar ahora*).

Resultado: el binario solo hace peticiones de red a `localhost` (en modo `watch`) y, una vez al día como mucho, a la API de releases de GitHub de este fork (desactivable con `auto_update = 0`).

## Extensión Genius

- **Botón en la barra del reproductor**, junto al de letras: abre la página de Genius de la canción que suena.
- **Menú de los tres puntos** (o clic derecho) de una canción, un álbum o un artista: opción *Buscar en Genius*. Los singles van a la página de la canción, porque Genius no tiene página de álbum para ellos; los artistas, a su página `genius.com/artists/...`.

Cómo funciona: Spotify no puede consultar la API de Genius (no envía cabeceras CORS), así que la extensión no hace ninguna petición. Abre en tu navegador una búsqueda de DuckDuckGo con el prefijo `\` ("voy a tener suerte") limitada a `genius.com`, que lleva directamente al primer resultado. DuckDuckGo recibe el nombre del artista y la canción; nada más.

## Requisitos

- Spotify de escritorio descargado de [spotify.com/download](https://www.spotify.com/download). **No sirve la versión de Microsoft Store**: está en `WindowsApps` y no se puede modificar.
- Ejecutar `spicetify` con los **mismos permisos que Spotify**, normalmente sin administrador. Si no, Spotify puede quedarse con la ventana en negro. Excepción: en la cuenta *Administrador* integrada de Windows todo, Spotify incluido, corre como administrador; ahí añade `--bypass-admin` a los comandos.

## Instalar

Descarga el archivo de tu sistema desde [Releases](../../releases/latest) (`windows-amd64.zip`, `linux-amd64.tar.gz`, `darwin-arm64.tar.gz`…), comprueba su hash con `SHA256SUMS` y descomprímelo en una carpeta fija:

```powershell
Get-FileHash .\spicetify-*-windows-amd64.zip   # debe coincidir con la línea de SHA256SUMS
```

### Actualizar

Es automático: `spicetify auto` (el que ejecuta la tarea programada) comprueba como mucho una vez al día si hay una release más reciente en [u0f/cli](https://github.com/u0f/cli/releases/latest) y la instala. También puedes forzarlo con `spicetify update`. Para desactivarlo: `spicetify config auto_update 0`.

Antes de tocar nada verifica que `SHA256SUMS` está firmado con la clave Ed25519 de las releases (la pública va dentro del binario, en `src/cmd/update.go`) y que el archivo descargado coincide con su hash; si algo no cuadra, no cambia nada. Después aparta el ejecutable actual (`.old`), descomprime la versión nueva encima de la carpeta y ejecuta el binario nuevo con `auto`, que detecta el cambio de versión y repite `restore`, `backup` y `apply`. Si la extracción falla, se restaura el ejecutable anterior.

A mano también funciona: descarga el archivo, descomprímelo encima y ejecuta `spicetify auto`.

### Versiones

`v<versión del original>-fork.<n>`. Por ejemplo, `v2.46.2-fork.1` es la primera versión de este fork sobre Spicetify 2.46.2; un cambio propio sube a `-fork.2`, y traer arreglos que llevan el original a 2.47.0 empieza en `v2.47.0-fork.1`.

Para publicar una, la Action [`release.yml`](.github/workflows/release.yml) compila todas las plataformas, firma `SHA256SUMS` y crea la release al subir la etiqueta. Necesita el secret `UPDATE_SIGNING_KEY` con la clave privada Ed25519 en PEM; si falta o no corresponde a la pública de `update.go`, la release no se publica. En un fork propio, genera tu par (`openssl genpkey -algorithm ed25519 -out key.pem`), pon la pública (`openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64`) en `updatePublicKey` y `releaseRepo` apuntando a tu repo.

```bash
git tag v2.46.2-fork.1
git push origin v2.46.2-fork.1
```

## Compilar desde el código

Necesitas [Go](https://go.dev/dl/) 1.26 o superior y [Node.js](https://nodejs.org/) 18 o superior con pnpm (`corepack enable`).

```bash
pnpm install --frozen-lockfile
pnpm build:wrapper
go build -ldflags "-X main.version=2.46.2-fork.1" -o spicetify.exe
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

**Cuando Spotify se actualiza** borra los cambios. `spicetify auto` lo detecta y vuelve a hacer backup y apply (si todo sigue aplicado, no hace nada). En Windows puedes dejarlo automático con una tarea programada que lo ejecute al iniciar sesión y cada hora, sin ventana y sin permisos de administrador (desde PowerShell, con la ruta de tu `spicetify.exe`):

```powershell
$exe = "C:\ruta\a\spicetify.exe"
$user = "$env:USERDOMAIN\$env:USERNAME"
Register-ScheduledTask -TaskName "Spicetify auto-apply" `
  -Action (New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless `"$exe`" auto -q -n" -WorkingDirectory (Split-Path $exe)) `
  -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user), (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)) `
  -Principal (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited) `
  -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew)
```

En la cuenta *Administrador* integrada de Windows, añade `--bypass-admin` después de `auto -q -n`: esa cuenta ignora `-RunLevel Limited` y spicetify se negaría a ejecutarse. Si Spotify estaba abierto cuando se reaplica, los cambios se ven al reiniciarlo. Para quitarla: `Unregister-ScheduledTask -TaskName "Spicetify auto-apply"`.

## Mantenimiento

Al no tener auto-update, las correcciones para nuevas versiones de Spotify hay que traerlas desde el proyecto original.

La GitHub Action [`sync-upstream.yml`](.github/workflows/sync-upstream.yml) lo comprueba cada día a las 6:00 UTC y, si hay commits nuevos, abre una pull request de `spicetify:main` a `main` con una lista de comprobación. No fusiona nada sola. También se puede lanzar a mano desde *Actions → Sync upstream → Run workflow*. Para que funcione en un fork:

1. Pestaña *Actions* → activar los workflows.
2. *Settings → Actions → General → Workflow permissions* → marcar *Allow GitHub Actions to create and approve pull requests*.

Para hacerlo a mano:

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
