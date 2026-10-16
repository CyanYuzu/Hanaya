import test from "node:test";
import assert from "node:assert/strict";
import {
	createReaderChapter,
	isMangaImageURL,
	spreadIndices,
	viewportPages,
} from "../src/utils/manga-reader.ts";
import { mangaSchema } from "../src/utils/manga-schema.ts";

test("one Markdown work validates chapters, order, directions and duplicate IDs", () => {
	const chapter = {
		id: "first",
		title: "First",
		pages: ["https://images.example.org/1.jpg"],
	};
	const work = {
		book_id: "my-work",
		title: "Work",
		published: "2026-10-16",
		chapters: [chapter, { ...chapter, id: "second", reading_direction: "ltr" }],
	};
	const parsed = mangaSchema.parse(work);
	assert.deepEqual(
		parsed.chapters.map((c) => c.id),
		["first", "second"],
	);
	assert.equal(parsed.reading_direction, "rtl");
	assert.equal(parsed.chapters[1].reading_direction, "ltr");
	assert.equal(
		mangaSchema.safeParse({ ...work, chapters: [chapter, chapter] }).success,
		false,
	);
	assert.equal(
		mangaSchema.safeParse({ ...work, chapters: [{ ...chapter, pages: [] }] })
			.success,
		false,
	);
	assert.equal(
		mangaSchema.safeParse({
			...work,
			chapters: [
				{ ...chapter, pages: [{ src: chapter.pages[0], width: 600 }] },
			],
		}).success,
		false,
	);
	assert.equal(
		mangaSchema.safeParse({ ...work, book_id: "../work" }).success,
		false,
	);
});

test("authored HTTPS images allow custom buckets, unicode names and CDN parameters", () => {
	for (const url of [
		"https://images.example.org/work/001.jpg",
		"https://cdn.example.org/作品/第1话/01.webp?width=1600&v=2",
	])
		assert.equal(isMangaImageURL(url), true);
	const result = createReaderChapter(
		[
			"https://images.example.org/1.jpg",
			{ src: "https://other.example.org/2.webp", width: 800, height: 1200 },
		],
		"ltr",
	);
	assert.equal(result.pages[0].estimated, true);
	assert.equal(result.pages[1].estimated, false);
	assert.equal(result.pages[1].width, 800);
	assert.equal(result.reading_direction, "ltr");
});
test("unsafe links and invalid dimensions fail before rendering", () => {
	for (const url of [
		"javascript:alert(1)",
		"data:image/png,x",
		"//example.org/1.jpg",
		"http://example.org/1.jpg",
		"https://user:password@example.org/1.jpg",
		"https://example.org/1.jpg#fragment",
		"https://example.org/%00.jpg",
		"https://example.org/%2e%2e/1.jpg",
		"https://example.org/a%5cb.jpg",
		" https://example.org/1.jpg",
	])
		assert.equal(isMangaImageURL(url), false, url);
	for (const page of [
		{ src: "https://x.example/1.jpg", width: 0, height: 1 },
		{ src: "https://x.example/1.jpg", width: 1 },
		{ src: "https://x.example/1.jpg", width: 1, height: 65537 },
	])
		assert.throws(() => createReaderChapter([page], "rtl"));
	assert.throws(() => createReaderChapter([], "rtl"));
	assert.throws(() =>
		createReaderChapter(Array(10001).fill("https://x.example/a.jpg"), "rtl"),
	);
});
test("cover and final odd page do not duplicate facing pages", () => {
	assert.deepEqual(spreadIndices(0, 4), [0]);
	assert.deepEqual(spreadIndices(1, 4), [1, 2]);
	assert.deepEqual(spreadIndices(3, 4), [3]);
});
test("long chapters retain at most five nearby images including after a large jump", () => {
	const near = Array.from({ length: 10000 }, (_, i) => i);
	assert.deepEqual(viewportPages(500, 10000, near), [500, 499, 501, 498, 502]);
	assert.deepEqual(viewportPages(0, 2, near), [0, 1]);
	assert.deepEqual(viewportPages(9999, 10000, near), [9999, 9998, 9997]);
});
