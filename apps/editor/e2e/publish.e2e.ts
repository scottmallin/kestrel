import { expect, test } from "@playwright/test";
import { openEditor, placeListing, publishAndOpenEmbed } from "./editor.ts";

test("publishes a Map and shows its Listings in the Embed, with a searchable directory", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await placeListing(page, editor, 2, "Boots");
	await placeListing(page, editor, 14, "Zara");
	await expect(page.getByTestId("save-status")).toHaveText("All changes saved");

	await publishAndOpenEmbed(page);

	await expect(page.getByRole("heading", { name: "Test mall" })).toBeVisible();
	await expect(page.locator(".maplibregl-canvas")).toBeVisible();
	const results = page.getByRole("list").getByRole("button");
	await expect(results).toHaveText([/Boots/, /Zara/]);
	await expect(page.getByRole("status")).toHaveText("2 places");

	await page.getByLabel("Find a place").fill("za");
	await expect(results).toHaveText([/Zara/]);
	await expect(page.getByRole("status")).toHaveText("1 place");
});

test("the Embed's directory works from the keyboard alone", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await placeListing(page, editor, 2, "Boots");
	await publishAndOpenEmbed(page);
	await expect(page.getByLabel("Find a place")).toBeEnabled();

	await page.keyboard.press("Tab");
	await expect(page.getByLabel("Find a place")).toBeFocused();
	await page.keyboard.type("boo");
	await page.keyboard.press("Tab");
	const boots = page.getByRole("button", { name: /Boots/ });
	await expect(boots).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(boots).toHaveAttribute("aria-pressed", "true");
	await expect(
		page.getByRole("heading", { name: "Boots", level: 2 }),
	).toBeVisible();
});

test("publishing again updates the same Embed", async ({ page }) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await placeListing(page, editor, 2, "Boots");
	await page.getByRole("button", { name: "Publish" }).click();
	const firstCode = await page.getByLabel("Embed code").inputValue();
	await page.getByRole("button", { name: "Close" }).click();

	await placeListing(page, editor, 14, "Zara");
	const src = await publishAndOpenEmbed(page);

	expect(firstCode).toContain(src);
	await expect(page.getByRole("list").getByRole("button")).toHaveText([
		/Boots/,
		/Zara/,
	]);
});
