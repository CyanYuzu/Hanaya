import { z } from "astro/zod";
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const publicMedia = z
	.string()
	.max(2048)
	.refine(
		(value) =>
			/^(?:https:\/\/[^/]+)?\/manga-media\/[A-Za-z0-9_./-]+$/.test(value) &&
			!value.split("/").includes(".."),
		"Public media URL required",
	);
export const mangaSchema = z
	.object({
		kind: z.enum(["book", "chapter"]),
		book_id: id,
		chapter_id: id.optional(),
		title: z.string().min(1).max(1024),
		author: z.string().default(""),
		description: z.string().default(""),
		cover: z.union([publicMedia, z.literal("")]).default(""),
		reader_manifest: publicMedia.optional(),
		chapter_order: z.number().default(0),
		published: z.coerce.date(),
		updated: z.coerce.date().optional(),
		draft: z.boolean().default(false),
	})
	.superRefine((value, ctx) => {
		if (
			value.kind === "chapter" &&
			(!value.chapter_id || !value.reader_manifest?.endsWith("/current.json"))
		)
			ctx.addIssue({
				code: "custom",
				message: "Chapter ID and public current.json required",
			});
		if (value.kind === "book" && (value.chapter_id || value.reader_manifest))
			ctx.addIssue({
				code: "custom",
				message: "Book must not carry chapter fields",
			});
	});
