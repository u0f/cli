// Fork: no remote scripts. Japanese/Korean/Chinese conversion libraries used to be
// loaded from a CDN at runtime; they are gone, so every conversion returns the input text.
class Translator {
	constructor() {}

	async awaitFinished() {}

	async romajifyText(text) {
		return text;
	}

	async convertToRomaja(text) {
		return text;
	}

	async convertChinese(text) {
		return text;
	}

	async convertToPinyin(text) {
		return text;
	}
}
