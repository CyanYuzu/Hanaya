import { z } from "astro/zod";
import { isMangaImageURL } from "./manga-reader.ts";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const image = z
	.string()
	.max(4096)
	.refine(
		isMangaImageURL,
		"An HTTPS image URL without credentials is required",
	);
const dimension = z.number().int().min(1).max(65536);
const page = z.union([
	image,
	z
		.object({
			src: image,
			width: dimension.optional(),
			height: dimension.optional(),
		})
		.refine(
			(p) => Boolean(p.width) === Boolean(p.height),
			"Supply both width and height",
		),
]);
const chapter = z.object({
	id,
	title: z.string().min(1).max(1024),
	description: z.string().default(""),
	published: z.coerce.date().optional(),
	reading_direction: z.enum(["rtl", "ltr"]).optional(),
	pages: z.array(page).min(1).max(10000),
});
/** Each document owns a work and all its chapters, in the author's order. */
export const mangaSchema = z
	.object({
		book_id: id,
		title: z.string().min(1).max(1024),
		author: z.string().default(""),
		description: z.string().default(""),
		cover: z.union([image, z.literal("")]).default(""),
		published: z.coerce.date(),
		updated: z.coerce.date().optional(),
		draft: z.boolean().default(false),
		reading_direction: z.enum(["rtl", "ltr"]).default("rtl"),
		chapters: z.array(chapter).default([]),
	})
	.superRefine((work, ctx) => {
		const seen = new Set<string>();
		work.chapters.forEach((c, i) => {
			if (seen.has(c.id))
				ctx.addIssue({
					code: "custom",
					path: ["chapters", i, "id"],
					message: "Duplicate chapter ID",
				});
			seen.add(c.id);
		});
	});
