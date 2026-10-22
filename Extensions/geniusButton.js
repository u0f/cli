// NAME: Genius Button
// AUTHOR: fork
// DESCRIPTION: Open the Genius page of the current track from the playbar, or of any track/album from its context menu.

/// <reference path="../globals.d.ts" />

// Spotify's webview cannot call genius.com (no CORS headers), so this extension sends no
// requests to Genius. It opens a DuckDuckGo "first result" query (`\` prefix) restricted to
// genius.com in the system browser, which lands straight on the song or album page.
(async function GeniusButton() {
	while (!Spicetify?.Player?.data || !Spicetify?.Playbar?.Button || !Spicetify?.ContextMenu?.Item || !Spicetify?.GraphQL?.Definitions) {
		await new Promise((resolve) => setTimeout(resolve, 300));
	}

	const { URI, GraphQL, Locale } = Spicetify;
	const isSpanish = Locale.getLocale().startsWith("es");
	const TEXT = isSpanish
		? { open: "Abrir en Genius", search: "Buscar en Genius", noTrack: "No hay ninguna canción sonando", failed: "No se pudo leer la información" }
		: { open: "Open in Genius", search: "Search on Genius", noTrack: "Nothing is playing", failed: "Could not read item info" };

	// Genius logo, from Simple Icons (CC0-1.0).
	const ICON =
		'<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M0 6.827c0 2.164.79 4.133 2.167 5.51.393.393.786.59 1.18.983h.195c.197 0 .196-.196.196-.196-.393-.787-.588-1.77-.588-2.754 0-2.164.982-4.329 2.36-5.706V1.518c0-.197-.197-.196-.197-.196h-2.95C.789 2.896 0 4.664 0 6.827zm2.559 12.59c2.36 2.164 5.31 3.343 8.851 3.343 7.082 0 12.59-5.702 12.59-12.586 0-3.344-1.378-6.492-3.542-8.656h-.196c0-.197-.196 0-.196 0 .59 1.574.983 3.147.983 4.918 0 7.278-5.902 13.373-13.377 13.373-1.77 0-3.344-.393-4.917-.983-.197 0-.196.199-.196.395zm5.9-11.998c0 .59.395 1.178.788 1.571h.392c3.54 1.18 4.722-.193 4.722-1.767V5.056c0-.196.196-.196.196-.196h.787c.197 0 .196-.196.196-.196-.196-1.18-.784-2.358-1.571-3.342h-2.363c0-.197-.196 0-.196.196v2.95c0 1.574-1.18 2.754-2.754 2.951 0-.197-.196 0-.196 0z"/></svg>';

	// "Song (feat. X)", "Song - Remastered 2011", "Album (Deluxe Edition)" -> "Song" / "Album"
	const clean = (name) =>
		name
			.replace(/\s*[([](feat|ft|with|prod)\.?\s[^)\]]*[)\]]/gi, "")
			.replace(/\s*[([][^)\]]*(deluxe|remaster|edition|version|anniversary)[^)\]]*[)\]]/gi, "")
			.replace(/\s+-\s+.*(remaster|live|version|edit|mix|mono|stereo|acoustic|demo).*$/i, "")
			.trim() || name;

	// Only the main artist: Genius slugs drop featured artists and extra names dilute the query.
	const openSearch = (path, artist, name, suffix = "") => {
		const query = `\\site:${path} ${artist ?? ""} ${clean(name)} ${suffix}`.replace(/\s+/g, " ").trim();
		window.open(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, "_blank", "noopener");
	};
	const openSong = (artist, title) => openSearch("genius.com", artist, title, "lyrics");
	const openAlbum = (artist, album) => openSearch("genius.com/albums", artist, album);

	const openCurrentTrack = () => {
		const item = Spicetify.Player.data?.item;
		if (!item?.name || item.type === "episode" || item.type === "ad") return Spicetify.showNotification(TEXT.noTrack);
		openSong(item.artists?.[0]?.name, item.name);
	};

	const openFromUri = async ([uri]) => {
		try {
			if (URI.isTrack(uri)) {
				const { data } = await GraphQL.Request(GraphQL.Definitions.getTrack, { uri });
				const track = data.trackUnion;
				openSong(track.firstArtist?.items?.[0]?.profile?.name, track.name);
			} else {
				const { data } = await GraphQL.Request(GraphQL.Definitions.getAlbum, { uri, locale: Locale.getLocale(), offset: 0, limit: 1 });
				const album = data.albumUnion;
				const artist = album.artists?.items?.[0]?.profile?.name;
				// Genius has no album page for singles; their song page is what the user wants.
				if (album.type === "SINGLE") openSong(artist, album.name);
				else openAlbum(artist, album.name);
			}
		} catch (error) {
			console.error("[geniusButton]", error);
			Spicetify.showNotification(TEXT.failed, true);
		}
	};

	const button = new Spicetify.Playbar.Button(TEXT.open, ICON, openCurrentTrack);
	new Spicetify.ContextMenu.Item(TEXT.search, openFromUri, (uris) => uris.length === 1 && (URI.isTrack(uris[0]) || URI.isAlbum(uris[0])), ICON).register();

	// Playbar buttons are inserted first in the row; keep ours right next to the lyrics button.
	const placeNextToLyrics = () => {
		const lyrics = document.querySelector('[data-testid="lyrics-button"]');
		if (lyrics && lyrics.previousElementSibling !== button.element) lyrics.before(button.element);
	};
	placeNextToLyrics();
	setTimeout(placeNextToLyrics, 1000);
	Spicetify.Player.addEventListener("songchange", () => setTimeout(placeNextToLyrics, 500));
})();
