import { expect, test } from "@playwright/test";

test("retired catalogues and readers return 404 and disappear from navigation", async ({
	page,
	request,
}) => {
	for (const route of [
		"/manga/",
		"/manga/old-work/old-chapter/",
		"/textbooks/",
		"/textbooks/old-book/",
	]) {
		const response = await request.get(route);
		expect(response.status(), route).toBe(404);
	}
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/");
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await expect(
		page.locator('a[href^="/manga"],a[href^="/textbooks"]'),
	).toHaveCount(0);
	await page.getByRole("link", { name: "归档", exact: true }).first().click();
	await expect(page).toHaveURL(/\/archive\//);
	await expect(
		page.locator('a[href^="/manga"],a[href^="/textbooks"]'),
	).toHaveCount(0);
});
