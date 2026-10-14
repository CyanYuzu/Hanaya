import { getCollection, type CollectionEntry } from "astro:content";
export type MangaEntry = CollectionEntry<"manga">;
export interface MangaBook {
	entry: MangaEntry;
	chapters: MangaEntry[];
}
export async function getMangaBooks(): Promise<MangaBook[]> {
	const entries = (await getCollection("manga")).filter((e) => !e.data.draft);
	const books = new Map<string, MangaBook>();
	const chapters = new Set<string>();
	for (const entry of entries) {
		const d = entry.data;
		if (d.kind !== "book") continue;
		if (books.has(d.book_id))
			throw new Error(`Duplicate manga book: ${d.book_id}`);
		books.set(d.book_id, { entry, chapters: [] });
	}
	for (const entry of entries) {
		const d = entry.data;
		if (d.kind !== "chapter") continue;
		const key = `${d.book_id}/${d.chapter_id}`;
		if (chapters.has(key)) throw new Error(`Duplicate manga chapter: ${key}`);
		chapters.add(key);
		const book = books.get(d.book_id);
		if (!book) throw new Error(`Manga chapter has no published book: ${key}`);
		book.chapters.push(entry);
	}
	for (const book of books.values())
		book.chapters.sort(
			(a, b) =>
				a.data.chapter_order - b.data.chapter_order ||
				a.data.chapter_id!.localeCompare(b.data.chapter_id!),
		);
	return Array.from(books.values()).sort(
		(a, b) =>
			b.entry.data.published.getTime() - a.entry.data.published.getTime(),
	);
}
