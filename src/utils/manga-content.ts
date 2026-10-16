import { getCollection, type CollectionEntry } from "astro:content";
import type { MangaSourcePage } from "./manga-reader";
export type MangaEntry = CollectionEntry<"manga">;
export interface MangaChapter {
	data: {
		book_id: string;
		chapter_id: string;
		title: string;
		description: string;
		published: Date;
		reading_direction: "rtl" | "ltr";
		pages: MangaSourcePage[];
	};
}
export interface MangaBook {
	entry: MangaEntry;
	chapters: MangaChapter[];
}
export async function getMangaBooks(): Promise<MangaBook[]> {
	const entries = (await getCollection("manga")).filter((e) => !e.data.draft);
	const seen = new Set<string>();
	return entries
		.map((entry) => {
			const work = entry.data;
			if (seen.has(work.book_id))
				throw new Error(`Duplicate manga book: ${work.book_id}`);
			seen.add(work.book_id);
			return {
				entry,
				chapters: work.chapters.map((c) => ({
					data: {
						book_id: work.book_id,
						chapter_id: c.id,
						title: c.title,
						description: c.description,
						published: c.published ?? work.published,
						reading_direction: c.reading_direction ?? work.reading_direction,
						pages: c.pages,
					},
				})),
			};
		})
		.sort(
			(a, b) =>
				b.entry.data.published.getTime() - a.entry.data.published.getTime(),
		);
}
