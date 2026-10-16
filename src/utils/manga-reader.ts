export type MangaSourcePage =
	| string
	| { src: string; width?: number; height?: number };
export interface ReaderPage {
	page_id: string;
	url: string;
	width: number;
	height: number;
	estimated: boolean;
}
export interface ReaderChapter {
	pages: ReaderPage[];
	page_count: number;
	reading_direction: "rtl" | "ltr";
}

/** URLs are explicitly authored in trusted Markdown, never discovered from a remote manifest. */
export function isMangaImageURL(value: string): boolean {
	try {
		if (value !== value.trim() || /[\u0000-\u0020\u007f\\]/.test(value))
			return false;
		const decoded = decodeURIComponent(value);
		if (
			/[\u0000-\u001f\u007f\\]/.test(decoded) ||
			decoded.split(/[/?#]/).some((s) => s === "." || s === "..")
		)
			return false;
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			Boolean(url.hostname) &&
			!url.username &&
			!url.password &&
			!url.hash
		);
	} catch {
		return false;
	}
}

export function createReaderChapter(
	pages: MangaSourcePage[],
	direction: "rtl" | "ltr",
): ReaderChapter {
	if (
		!pages.length ||
		pages.length > 10000 ||
		!["rtl", "ltr"].includes(direction)
	)
		throw new Error("schema");
	return {
		reading_direction: direction,
		page_count: pages.length,
		pages: pages.map((source, i) => {
			const page = typeof source === "string" ? { src: source } : source;
			if (!isMangaImageURL(page.src)) throw new Error("schema");
			const estimated = page.width === undefined && page.height === undefined;
			if (
				!estimated &&
				![page.width, page.height].every(
					(n) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 65536,
				)
			)
				throw new Error("schema");
			return {
				page_id: String(i + 1),
				url: page.src,
				width: page.width ?? 900,
				height: page.height ?? 1200,
				estimated,
			};
		}),
	};
}
export function spreadIndices(index: number, count: number): number[] {
	if (index === 0) return [0];
	const start = 1 + Math.floor((index - 1) / 2) * 2;
	return start + 1 < count ? [start, start + 1] : [start];
}
export function viewportPages(
	index: number,
	count: number,
	near: Iterable<number>,
): number[] {
	const candidates = new Set([index, ...near, index + 1]);
	return [...candidates]
		.filter((i) => i >= 0 && i < count && Math.abs(i - index) <= 2)
		.sort((a, b) => Math.abs(a - index) - Math.abs(b - index) || a - b)
		.slice(0, 5);
}
