// NAME: Trash Skip
// AUTHOR: fork
// DESCRIPTION: Send songs and artists to a trash bin from their context menu or the playbar; trashed ones are skipped automatically.

/// <reference path="../globals.d.ts" />

// Everything stays in localStorage; the only lookups are Spotify's own GraphQL queries to get
// the names shown in the trash list. The profile menu entry lists and restores trashed items.
(async function TrashSkip() {
	while (!Spicetify?.Player?.data || !Spicetify?.Playbar?.Button || !Spicetify?.ContextMenu?.Item || !Spicetify?.Menu?.Item || !Spicetify?.PopupModal || !Spicetify?.Locale?.getLocale) {
		await new Promise((resolve) => setTimeout(resolve, 300));
	}

	const { GraphQL, Locale, Player } = Spicetify;
	const is = (helper, uri) => typeof Spicetify.URI?.[helper] === "function" && Spicetify.URI[helper](uri);
	const TEXT = Locale.getLocale().startsWith("es")
		? {
				title: "Papelera",
				trashSong: "Mandar canción a la papelera",
				restoreSong: "Sacar canción de la papelera",
				trashArtist: "Mandar artista a la papelera",
				restoreArtist: "Sacar artista de la papelera",
				enabled: "Saltar automáticamente",
				songs: "Canciones",
				artists: "Artistas",
				empty: "Vacía",
				restore: "Sacar",
				trashed: (name) => `${name} → papelera`,
				restored: (name) => `${name} sacado de la papelera`,
			}
		: {
				title: "Trash bin",
				trashSong: "Send song to trash",
				restoreSong: "Restore song from trash",
				trashArtist: "Send artist to trash",
				restoreArtist: "Restore artist from trash",
				enabled: "Skip automatically",
				songs: "Songs",
				artists: "Artists",
				empty: "Empty",
				restore: "Restore",
				trashed: (name) => `${name} → trash`,
				restored: (name) => `${name} restored from trash`,
			};

	// Trash can outline (own drawing, 16x16).
	const ICON =
		'<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 1h4a1 1 0 0 1 1 1v1h3.5a.5.5 0 0 1 0 1H13l-.8 10.1A1 1 0 0 1 11.2 15H4.8a1 1 0 0 1-1-.9L3 4h-1.5a.5.5 0 0 1 0-1H5V2a1 1 0 0 1 1-1zm0 2h4V2H6v1zM4 4l.8 10h6.4L12 4H4zm2 2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 6 6zm4 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 10 6z"/></svg>';

	// { songs: { uri: "Artist - Title" }, artists: { uri: "Name" } }
	const KEY = "trashSkip:items";
	const ENABLED_KEY = "trashSkip:enabled";
	const load = () => {
		try {
			const value = JSON.parse(localStorage.getItem(KEY));
			return { songs: value?.songs ?? {}, artists: value?.artists ?? {} };
		} catch {
			return { songs: {}, artists: {} };
		}
	};
	const trash = load();
	const save = () => localStorage.setItem(KEY, JSON.stringify(trash));
	const isEnabled = () => localStorage.getItem(ENABLED_KEY) !== "false";

	const isTrashed = (item) => !!item && (item.uri in trash.songs || (item.artists ?? []).some((artist) => artist.uri in trash.artists));

	const skipIfTrashed = () => {
		if (isEnabled() && isTrashed(Player.data?.item)) Player.next();
	};

	const toggle = (list, uri, name) => {
		if (uri in trash[list]) {
			const stored = trash[list][uri];
			delete trash[list][uri];
			Spicetify.showNotification(TEXT.restored(name || stored));
		} else {
			trash[list][uri] = name || uri;
			Spicetify.showNotification(TEXT.trashed(name || uri));
		}
		save();
		updateWidget();
		skipIfTrashed();
	};

	const getTrack = async (uri) => {
		const current = Player.data?.item;
		if (current?.uri === uri) return { name: current.name, artists: current.artists ?? [] };
		const { data } = await GraphQL.Request(GraphQL.Definitions.getTrack, { uri });
		const track = data.trackUnion;
		const artists = [...(track.firstArtist?.items ?? []), ...(track.otherArtists?.items ?? [])].map((a) => ({ uri: a.uri, name: a.profile?.name }));
		return { name: track.name, artists };
	};

	const getArtistName = async (uri) => {
		const { data } = await GraphQL.Request(GraphQL.Definitions.queryArtistOverview, { uri, locale: Locale.getLocale(), includePrerelease: false });
		return data.artistUnion.profile.name;
	};

	const songLabel = (track) => `${track.artists[0]?.name ? `${track.artists[0].name} - ` : ""}${track.name}`;

	// Names are cosmetic; a failed lookup still trashes the URI.
	const safely = async (lookup) => {
		try {
			return await lookup();
		} catch (error) {
			console.error("[trashSkip]", error);
		}
	};

	// Context menu: songs (one or many) and artists. Runs on every menu render, so never throw.
	const songItem = new Spicetify.ContextMenu.Item(
		TEXT.trashSong,
		async (uris) => {
			for (const uri of uris) {
				if (uri in trash.songs) toggle("songs", uri);
				else {
					const track = await safely(() => getTrack(uri));
					toggle("songs", uri, track && songLabel(track));
				}
			}
		},
		(uris) => {
			try {
				if (!uris?.length || !uris.every((uri) => is("isTrack", uri))) return false;
				songItem.name = uris.every((uri) => uri in trash.songs) ? TEXT.restoreSong : TEXT.trashSong;
				return true;
			} catch {
				return false;
			}
		},
		ICON,
	);
	songItem.register();

	// On a track it acts on the track's main artist, on an artist page on that artist.
	let menuArtist = null;
	const artistItem = new Spicetify.ContextMenu.Item(
		TEXT.trashArtist,
		async ([uri]) => {
			if (is("isArtist", uri)) return toggle("artists", uri, uri in trash.artists ? undefined : await safely(() => getArtistName(uri)));
			const artist = menuArtist ?? (await safely(() => getTrack(uri)))?.artists[0];
			if (artist?.uri) toggle("artists", artist.uri, artist.name);
		},
		(uris) => {
			try {
				if (uris?.length !== 1) return false;
				const [uri] = uris;
				if (is("isArtist", uri)) {
					menuArtist = null;
					artistItem.name = uri in trash.artists ? TEXT.restoreArtist : TEXT.trashArtist;
					return true;
				}
				if (!is("isTrack", uri)) return false;
				// The label can only reflect the state when the artist is already known (current track).
				const current = Player.data?.item;
				menuArtist = current?.uri === uri ? current.artists?.[0] : null;
				artistItem.name = menuArtist && menuArtist.uri in trash.artists ? TEXT.restoreArtist : TEXT.trashArtist;
				return true;
			} catch {
				return false;
			}
		},
		ICON,
	);
	artistItem.register();

	// Playbar (right-hand buttons; Playbar.Widget no longer finds its container): trash the current song.
	const widget = new Spicetify.Playbar.Button(TEXT.trashSong, ICON, () => {
		const item = Player.data?.item;
		if (item?.uri && is("isTrack", item.uri)) toggle("songs", item.uri, songLabel({ name: item.name, artists: item.artists ?? [] }));
	});
	function updateWidget() {
		const uri = Player.data?.item?.uri;
		const trashed = !!uri && uri in trash.songs;
		widget.active = trashed;
		widget.label = trashed ? TEXT.restoreSong : TEXT.trashSong;
	}

	Player.addEventListener("songchange", () => {
		updateWidget();
		skipIfTrashed();
	});
	updateWidget();
	skipIfTrashed();

	// Profile menu: on/off switch and the trashed items, each with a restore button.
	const STYLE = `
.trash-skip .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; }
.trash-skip .row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trash-skip h3 { margin-top: 20px; }
.trash-skip .empty { color: var(--spice-subtext); }
.trash-skip button { flex-shrink: 0; padding: 4px 12px; border: 1px solid #727272; border-radius: 500px; background: transparent;
  color: var(--spice-text); cursor: pointer; }
.trash-skip button.off { color: var(--spice-subtext); }
`;
	const row = (label, button) => {
		const element = document.createElement("div");
		element.className = "row";
		const span = document.createElement("span");
		span.textContent = label;
		span.title = label;
		element.append(span, button);
		return element;
	};
	const button = (label, onclick, className = "") => {
		const element = document.createElement("button");
		element.textContent = label;
		element.className = className;
		// Deferred: removing the clicked button mid-click makes the modal treat it as an outside click.
		element.onclick = () => setTimeout(onclick);
		return element;
	};
	const buildContent = () => {
		const content = document.createElement("div");
		content.className = "trash-skip";
		const render = () => {
			const style = document.createElement("style");
			style.textContent = STYLE;
			content.replaceChildren(style);
			content.appendChild(
				row(
					TEXT.enabled,
					button(isEnabled() ? "ON" : "OFF", () => {
						localStorage.setItem(ENABLED_KEY, String(!isEnabled()));
						render();
						skipIfTrashed();
					}, isEnabled() ? "" : "off"),
				),
			);
			for (const list of ["songs", "artists"]) {
				const heading = document.createElement("h3");
				const entries = Object.entries(trash[list]).sort(([, a], [, b]) => a.localeCompare(b));
				heading.textContent = `${TEXT[list]} (${entries.length})`;
				content.appendChild(heading);
				if (entries.length === 0) {
					const empty = document.createElement("p");
					empty.className = "empty";
					empty.textContent = TEXT.empty;
					content.appendChild(empty);
				}
				for (const [uri, name] of entries) {
					content.appendChild(
						row(
							name,
							button(TEXT.restore, () => {
								delete trash[list][uri];
								save();
								updateWidget();
								render();
							}),
						),
					);
				}
			}
		};
		render();
		return content;
	};
	new Spicetify.Menu.Item(TEXT.title, false, () => Spicetify.PopupModal.display({ title: TEXT.title, content: buildContent(), isLarge: true })).register();
})();
