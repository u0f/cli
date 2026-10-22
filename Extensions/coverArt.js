// NAME: Cover Art
// AUTHOR: fork
// DESCRIPTION: Context menu entry that opens the cover or profile picture of a track, album, artist, playlist, podcast, episode or user in the browser at the highest quality Spotify serves.

/// <reference path="../globals.d.ts" />

(async function CoverArt() {
	while (!Spicetify?.ContextMenu?.Item || !Spicetify?.GraphQL?.Definitions || !Spicetify?.Platform?.PlaylistAPI || !Spicetify?.Locale?.getLocale) {
		await new Promise((resolve) => setTimeout(resolve, 300));
	}

	const { GraphQL, Platform, CosmosAsync } = Spicetify;
	const TEXT = Spicetify.Locale?.getLocale?.().startsWith("es")
		? { open: "Abrir imagen en máxima calidad", none: "No tiene imagen", failed: "No se pudo obtener la imagen" }
		: { open: "Open image in full quality", none: "No image available", failed: "Could not get the image" };

	// Spicetify.URI can be swapped for a fuller object after load and some helpers may be
	// missing, so look them up on every call instead of keeping references.
	const is = (helper, uri) => typeof Spicetify.URI?.[helper] === "function" && Spicetify.URI[helper](uri);

	const IMAGE_QUERIES = [
		["isTrack", "fetchExtractedColorAndImageForTrackEntity"],
		["isAlbum", "fetchExtractedColorAndImageForAlbumEntity"],
		["isArtist", "fetchExtractedColorAndImageForArtistEntity"],
		["isPlaylistV1OrV2", "fetchExtractedColorAndImageForPlaylistEntity"],
		["isShow", "fetchExtractedColorAndImageForPodcastEntity"],
		["isEpisode", "fetchExtractedColorAndImageForEpisodeEntity"],
	];

	// Every `{ url, width }` found anywhere in a GraphQL response.
	const collectSources = (node, found = []) => {
		if (!node || typeof node !== "object") return found;
		if (typeof node.url === "string" && node.url.startsWith("https://")) found.push(node);
		for (const value of Object.values(node)) collectSources(value, found);
		return found;
	};
	const largest = (sources) => sources.reduce((best, s) => ((s.width ?? 0) > (best?.width ?? -1) ? s : best), undefined)?.url;

	// The API lists 640px at most; the CDN keeps bigger variants behind other size codes.
	const upgrade = (url) => {
		const mosaic = url.match(/^https:\/\/mosaic\.scdn\.co\/\d+\/(.+)$/);
		if (mosaic) return `https://mosaic.scdn.co/1280/${mosaic[1].replaceAll("ab67616d00001e02", "ab67616d0000b273")}`;
		// Album covers: ab67616d0000 + size code + id. 82c1 is the largest JPEG (up to 2000px).
		return url.replace(/\/image\/ab67616d0000[0-9a-f]{4}/, "/image/ab67616d000082c1");
	};

	const imageForUri = async (uri) => {
		if (is("isProfile", uri)) {
			// Internal endpoint the client itself uses; the public Web API often answers 429 here.
			const username = encodeURIComponent(Spicetify.URI.fromString(uri).username);
			const profile = await CosmosAsync.get(`https://spclient.wg.spotify.com/user-profile-view/v3/profile/${username}?playlist_limit=0&artist_limit=0&episode_limit=0`);
			return profile?.image_url;
		}
		const query = IMAGE_QUERIES.find(([helper]) => is(helper, uri))?.[1];
		const { data } = await GraphQL.Request(GraphQL.Definitions[query], { uri });
		const url = largest(collectSources(data));
		if (url || !is("isPlaylistV1OrV2", uri)) return url;
		// Spotify-made playlists (Daily Mix...) only expose their image through PlaylistAPI.
		const meta = await Platform.PlaylistAPI.getMetadata(uri);
		const image = meta?.images?.[0]?.url;
		return image?.startsWith("spotify:image:") ? `https://i.scdn.co/image/${image.slice(14)}` : image;
	};

	const openImage = async ([uri]) => {
		try {
			const url = await imageForUri(uri);
			if (!url) return Spicetify.showNotification(TEXT.none);
			window.open(upgrade(url), "_blank", "noopener");
		} catch (error) {
			console.error("[coverArt]", error);
			Spicetify.showNotification(TEXT.failed, true);
		}
	};

	// Runs on every context menu render: an exception here breaks the whole menu
	// ("Something went wrong"), so it must never throw.
	const isSupported = (uris) => {
		try {
			return uris?.length === 1 && (is("isProfile", uris[0]) || IMAGE_QUERIES.some(([helper, query]) => is(helper, uris[0]) && GraphQL.Definitions[query]));
		} catch {
			return false;
		}
	};

	new Spicetify.ContextMenu.Item(TEXT.open, openImage, isSupported, "external-link").register();
})();
