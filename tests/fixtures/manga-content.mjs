// Temporary, ignored build input. Never write fixtures to the content repository.
import { mkdir, writeFile, unlink, access } from "node:fs/promises";
const path = new URL(
	"../../src/content/manga/reader-acceptance.md",
	import.meta.url,
);
const command = process.argv[2];
if (command === "prepare") {
	try {
		await access(path);
		throw new Error("Fixture already exists; clean it first");
	} catch (e) {
		if (e.code !== "ENOENT") throw e;
	}
	await mkdir(new URL(".", path), { recursive: true });
	let chapters = "";
	for (let chapter = 1; chapter <= 2; chapter++) {
		chapters += `  - id: chapter-${chapter}\n    title: 测试第${chapter}话\n    pages:\n`;
		for (let page = 1; page <= 40; page++)
			chapters += `      - src: https://manga-fixture.invalid/${chapter}/${page}.svg\n        width: 600\n        height: 800\n`;
	}
	await writeFile(
		path,
		`---\nbook_id: reader-acceptance\ntitle: 阅读器自动测试\nauthor: 测试夹具\npublished: 2026-10-16\nreading_direction: rtl\nchapters:\n${chapters}---\n仅本地自动化测试，禁止发布。\n`,
	);
	console.log("Prepared ignored manga fixture");
} else if (command === "clean") {
	await unlink(path).catch((e) => {
		if (e.code !== "ENOENT") throw e;
	});
	console.log("Removed ignored manga fixture");
} else throw new Error("Use prepare or clean");
