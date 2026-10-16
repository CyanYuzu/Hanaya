import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Prepare ignored src/content input with node tests/fixtures/manga-content.mjs prepare.
 * Run with MANGA_READER_TEST=1, then clean it with the same script's clean command.
 * The repository dev-server configuration deliberately bypasses content sync.
 * External images are mocked; no fixture or image is published.
 */
test.skip(
	process.env.MANGA_READER_TEST !== "1",
	"Requires explicitly prepared, unpublished content fixture",
);
const chapter = "/manga/reader-acceptance/chapter-1/";
test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("https://manga-fixture.invalid/**", (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#eeeeee"/><text x="50" y="100" font-size="30" fill="#111111">Reader test</text></svg>',
		}),
	);
});
async function ready(page: import("@playwright/test").Page) {
	// A cold Astro dev server may still be compiling this chapter's Svelte island.
	await expect(page.locator("[data-manga-reader] img").first()).toBeVisible({timeout:15000});
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
}
test("catalogue opens a standalone reader; native return and back restore blog chrome", async ({
	page,
}) => {
	await page.goto("/manga/");
	await page.getByRole("link", { name: /阅读器自动测试/ }).click();
	await expect(page).toHaveURL(/\/manga\/reader-acceptance\/$/);
	await expect(page.locator("#main-layout")).toBeAttached();
	await page.locator("a[data-manga-reader-link]").first().click();
	await ready(page);
	await expect(page).toHaveURL(new RegExp(chapter));
	await expect(page.locator("#main-layout")).toHaveCount(0);
	await expect(page.locator("iframe")).toHaveCount(0);
	const dimensions = await page.locator("[data-manga-reader]").boundingBox();
	expect(dimensions?.height).toBeLessThanOrEqual(901);
	expect(dimensions?.height).toBeGreaterThanOrEqual(899);
	await page.getByRole("link", { name: "章节目录", exact: true }).click();
	await expect(page.locator("#main-layout")).toBeAttached();
	await page.goBack();
	await ready(page);
	await expect(page.locator("#main-layout")).toHaveCount(0);
});
test("paged mode loads a bounded window, remembers progress and can change chapter", async ({
	page,
}) => {
	const requests = new Set<string>();
	page.on("request", (request) => {
		if (request.url().startsWith("https://manga-fixture.invalid/"))
			requests.add(request.url());
	});
	await page.goto(chapter);
	await ready(page);
	expect(requests.size).toBeLessThanOrEqual(2);
	await expect(page.locator("[data-manga-reader] img")).toHaveCount(1);
	await page.locator(".reader-canvas").focus();
	await page.keyboard.press("ArrowLeft");
	await expect(page.getByRole("progressbar")).toHaveAttribute("value", "2");
	await page.reload();
	await ready(page);
	await expect(page.getByRole("progressbar")).toHaveAttribute("value", "2");
	const canvas = page.locator(".reader-canvas");
	await canvas.click({ position: { x: 640, y: 300 } });
	await expect(
		page.getByRole("button", { name: "阅读设置", exact: true }),
	).toBeHidden();
	await page.keyboard.press("Escape");
	await expect(
		page.getByRole("button", { name: "阅读设置", exact: true }),
	).toBeVisible();
	await page.getByRole("link", { name: "下一话", exact: true }).click();
	await expect(page).toHaveURL(/chapter-2/);
	await ready(page);
});
test("scroll mode loads at most five images and supports a distant page jump", async ({
	page,
}) => {
	await page.goto(chapter);
	await ready(page);
	await page.getByRole("button", { name: "阅读设置", exact: true }).click();
	await page.getByRole("combobox", { name: "阅读模式", exact: true }).click();
	await page.getByRole("option", { name: "连续滚动", exact: true }).click();
	await expect(page.locator(".reader-canvas.continuous")).toBeVisible();
	await page.getByRole("button", { name: "阅读设置", exact: true }).click();
	const input = page.getByRole("spinbutton", { name: "页码", exact: true });
	await input.fill("30");
	await input.press("Enter");
	await expect(page.getByRole("progressbar")).toHaveAttribute("value", "30");
	await expect(page.locator(".reader-canvas img").first()).toBeVisible();
	expect(await page.locator(".reader-canvas img").count()).toBeLessThanOrEqual(
		5,
	);
	await expect
		.poll(async () =>
			page
				.locator(".reader-canvas img")
				.evaluateAll((images) =>
					images.some((img) => img.getAttribute("src")?.endsWith("/30.svg")),
				),
		)
		.toBe(true);
	await page.locator(".reader-canvas").evaluate((el) => (el.scrollTop = 0));
	await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");
	expect(await page.locator(".reader-canvas img").count()).toBeLessThanOrEqual(
		5,
	);
});
for (const theme of ["light", "dark"]) {
	test(`standalone reader accessibility and mobile layout: ${theme}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.addInitScript(
			(theme) => localStorage.setItem("theme", theme),
			theme,
		);
		await page.goto(chapter);
		await ready(page);
		await expect(page.locator("html")).toHaveClass(
			theme === "dark" ? /dark/ : /^(?!.*dark)/,
		);
		const rect = await page.locator(".reader-canvas").boundingBox();
		expect(rect!.height).toBeGreaterThan(400);
		const imageRect = await page.locator(".reader-canvas img").first().boundingBox();
		expect(imageRect!.width).toBeLessThanOrEqual(390);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		await page.screenshot({
			path: test.info().outputPath(`reader-${theme}.png`),
		});
		const result = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
			.analyze();
		expect(result.violations).toEqual([]);
		await page.getByRole("button", { name: "阅读设置", exact: true }).click();
		await expect(
			page.getByRole("combobox", { name: "阅读模式", exact: true }),
		).toHaveCount(1);
		await expect(
			page.getByRole("combobox", { name: "阅读方向", exact: true }),
		).toHaveCount(1);
		const settingsResult = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
			.analyze();
		expect(settingsResult.violations).toEqual([]);
	});
}
