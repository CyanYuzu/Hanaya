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
const publicImage = z
	.string()
	.max(2048)
	.refine((value) => {
		try {
			const u = new URL(value);
			const decoded = decodeURIComponent(value);
			return (
				u.protocol === "https:" &&
				!u.username &&
				!u.password &&
				!u.search &&
				!u.hash &&
				decoded.includes("/成品图/") &&
				!decoded.split("/").some((p) => p === ".." || p === ".") &&
				/[0-9a-f]{64}\.png$/.test(u.pathname)
			);
		} catch {
			return false;
		}
	}, "Published image URL required");
export const mangaSchema = z
	.object({
		kind: z.enum(["book", "chapter"]),
		book_id: id,
		chapter_id: id.optional(),
		title: z.string().min(1).max(1024),
		author: z.string().default(""),
		description: z.string().default(""),
		cover: z.union([publicMedia, publicImage, z.literal("")]).default(""),
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
