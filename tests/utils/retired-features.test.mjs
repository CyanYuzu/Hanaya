import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { siteMarkdownProcessor } from "../../src/utils/markdown-processor.mjs";

test("retired lecture callouts retain their source instead of invoking a renderer", async () => {
	const renderer = await siteMarkdownProcessor.createRenderer({});
	const { code } = await renderer.render(
		"> [!eb-theorem] Old theorem\n> Original statement.\n\n> [!NOTE]\n> Ordinary note.",
	);
	assert.match(code, /\[!eb-theorem\] Old theorem/);
	assert.match(code, /Original statement/);
	assert.match(code, /data-admonition="note"/);
	assert.doesNotMatch(code, /data-callout="eb-/);
});

test("authoring documentation and stylesheet inventory are theme-owned", async () => {
	const manifest = JSON.parse(
		await readFile(
			new URL("../../src/plugins/markdown/manifest.json", import.meta.url),
			"utf8",
		),
	);
	assert.equal(
		manifest.stylesheetPacks.some((p) => p.id === "elegantbook"),
		false,
	);
	for (const syntax of manifest.syntaxes) {
		assert.ok(syntax.docs.length > 0, syntax.id);
		for (const path of syntax.docs) {
			assert.ok(
				path.startsWith("docs/") || path.startsWith(".agents/skills/"),
				path,
			);
			assert.ok(
				(
					await readFile(new URL("../../" + path, import.meta.url), "utf8")
				).trim().length > 100,
				path,
			);
		}
	}
});
