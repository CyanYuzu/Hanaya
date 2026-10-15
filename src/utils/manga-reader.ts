export interface PublicPage {
	page_id: string;
	url: string;
	width: number;
	height: number;
	sha256: string;
}
export interface PublicManifest {
	schema_version: 1;
	chapter_id: string;
	release_id: string;
	pages: PublicPage[];
	reading_direction: "rtl" | "ltr";
	page_count: number;
	updated_at: string;
	cover?: string;
}
const id = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const hash = /^[0-9a-f]{64}$/;
const release = /^\d{8}T\d{9}Z(?:-[0-9a-f]{8})?$/;
function object(value: unknown, keys: string[]): Record<string, unknown> {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).some((k) => !keys.includes(k))
	)
		throw new Error("schema");
	return value as Record<string, unknown>;
}
export function mediaURL(value: unknown, base: string): string {
	if (
		typeof value !== "string" ||
		value.length > 2048 ||
		!/^(?:https:\/\/[^/]+)?\/manga-media\/[A-Za-z0-9_./-]+$/.test(value) ||
		value.split("/").includes("..")
	)
		throw new Error("schema");
	const url = new URL(value, base);
	if (
		url.origin !== new URL(base).origin ||
		!url.pathname.startsWith("/manga-media/")
	)
		throw new Error("schema");
	return url.href;
}
export function imageURL(
	value: unknown,
	base: string,
	origins: readonly string[] = [],
): string {
	try {
		return mediaURL(value, base);
	} catch {}
	if (typeof value !== "string" || value.length > 2048)
		throw new Error("schema");
	let decoded: string;
	try {
		decoded = decodeURIComponent(value);
	} catch {
		throw new Error("schema");
	}
	if (
		decoded.split("/").some((p) => p === ".." || p === ".") ||
		decoded.includes("\\") ||
		[...decoded].some((char) => char.charCodeAt(0) < 32)
	)
		throw new Error("schema");
	const url = new URL(value, base);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		!origins.includes(url.origin) ||
		!decodeURIComponent(url.pathname).includes("/成品图/") ||
		!/[0-9a-f]{64}\.png$/.test(url.pathname)
	)
		throw new Error("schema");
	return url.href;
}
export function parseCurrent(value: unknown, base: string, chapter: string) {
	const c = object(value, ["chapter_id", "release_id", "manifest"]);
	if (
		c.chapter_id !== chapter ||
		typeof c.release_id !== "string" ||
		!release.test(c.release_id)
	)
		throw new Error("schema");
	return { release_id: c.release_id, manifest: mediaURL(c.manifest, base) };
}
export function parseManifest(
	value: unknown,
	base: string,
	chapter: string,
	version: string,
	origins: readonly string[] = [],
): PublicManifest {
	const m = object(value, [
		"schema_version",
		"chapter_id",
		"release_id",
		"pages",
		"reading_direction",
		"page_count",
		"updated_at",
		"cover",
	]);
	if (
		m.schema_version !== 1 ||
		m.chapter_id !== chapter ||
		m.release_id !== version ||
		typeof m.release_id !== "string" ||
		!release.test(m.release_id) ||
		!Array.isArray(m.pages) ||
		m.pages.length < 1 ||
		m.pages.length > 10000 ||
		m.page_count !== m.pages.length ||
		(m.reading_direction !== "rtl" && m.reading_direction !== "ltr") ||
		typeof m.updated_at !== "string" ||
		!Number.isFinite(Date.parse(m.updated_at))
	)
		throw new Error("schema");
	const seen = new Set<string>();
	const pages = m.pages.map((value) => {
		const p = object(value, ["page_id", "url", "width", "height", "sha256"]);
		if (
			typeof p.page_id !== "string" ||
			!id.test(p.page_id) ||
			seen.has(p.page_id) ||
			typeof p.sha256 !== "string" ||
			!hash.test(p.sha256) ||
			!Number.isInteger(p.width) ||
			!Number.isInteger(p.height) ||
			Number(p.width) < 1 ||
			Number(p.height) < 1 ||
			Number(p.width) > 65536 ||
			Number(p.height) > 65536
		)
			throw new Error("schema");
		seen.add(p.page_id);
		return {
			page_id: p.page_id,
			url: imageURL(p.url, base, origins),
			width: Number(p.width),
			height: Number(p.height),
			sha256: p.sha256,
		};
	});
	return {
		schema_version: 1,
		chapter_id: chapter,
		release_id: version,
		pages,
		reading_direction: m.reading_direction,
		page_count: pages.length,
		updated_at: m.updated_at,
		...(m.cover ? { cover: imageURL(m.cover, base, origins) } : {}),
	};
}
export async function boundedJSON(response: Response): Promise<unknown> {
	if (!response.ok)
		throw new Error(
			response.status === 404
				? "missing"
				: response.status === 401 || response.status === 403
					? "permission"
					: "network",
		);
	if (!response.headers.get("content-type")?.includes("application/json"))
		throw new Error("schema");
	const reader = response.body?.getReader();
	if (!reader) throw new Error("network");
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 4 * 1024 * 1024) throw new Error("schema");
			chunks.push(value);
		}
	} finally {
		await reader.cancel();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const c of chunks) {
		bytes.set(c, offset);
		offset += c.byteLength;
	}
	return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
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
