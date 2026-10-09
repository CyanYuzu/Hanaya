import { getCollection, type CollectionEntry } from "astro:content";
import path from "node:path";

export type TextbookEntry = CollectionEntry<"textbook">;

export interface TextbookChapter {
	entry: TextbookEntry;
	slug: string;
	title: string;
}

export interface TextbookBook {
	slug: string;
	entry: TextbookEntry;
	title: string;
	chapters: TextbookChapter[];
}

function getRelativeContentPath(entry: TextbookEntry): string {
	const root = path.resolve("src/content/textbook");
	const relativePath = entry.filePath
		? path.relative(root, entry.filePath)
		: entry.id;
	return relativePath.replaceAll("\\", "/");
}

function getBookAndFile(relativePath: string) {
	const normalized = relativePath.replace(/\.(md|mdx)$/i, "");
	const directory = path.posix.dirname(normalized);
	const slug = directory === "." ? "" : directory;
	const file = path.posix.basename(normalized);
	return { slug, file };
}

export async function getTextbooks(): Promise<TextbookBook[]> {
	const entries = await getCollection("textbook");
	const groups = new Map<
		string,
		{ metadata?: TextbookEntry; chapters: TextbookEntry[] }
	>();

	for (const entry of entries) {
		const { slug, file } = getBookAndFile(getRelativeContentPath(entry));
		if (!slug) continue;

		const group = groups.get(slug) ?? { chapters: [] };
		if (file.toLowerCase() === "metadata") {
			group.metadata = entry;
		} else if (!entry.data.draft) {
			group.chapters.push(entry);
		}
		groups.set(slug, group);
	}

	const collator = new Intl.Collator("zh-CN", {
		numeric: true,
		sensitivity: "base",
	});
	return [...groups.entries()]
		.flatMap(([slug, group]) => {
			const entry = group.metadata;
			if (!entry || entry.data.draft || !entry.data.title.trim()) return [];

			const chapters = group.chapters
				.map((chapterEntry) => {
					const { file } = getBookAndFile(
						getRelativeContentPath(chapterEntry),
					);
					return {
						entry: chapterEntry,
						slug: file,
						title: chapterEntry.data.title.trim() || file,
					};
				})
				.sort((a, b) => collator.compare(a.title, b.title));

			return [
				{
					slug,
					entry,
					title: entry.data.title,
					chapters,
				},
			];
		})
		.sort((a, b) => collator.compare(a.title, b.title));
}

export function getTextbookUrl(bookSlug: string): string {
	return `/textbooks/${bookSlug}/`;
}

export function getTextbookChapterUrl(
	bookSlug: string,
	chapterSlug: string,
): string {
	return `${getTextbookUrl(bookSlug)}${chapterSlug}/`;
}
