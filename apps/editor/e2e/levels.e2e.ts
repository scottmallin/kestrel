import { expect, type Page, test } from "@playwright/test";
import { openEditor, placeListing, publishAndOpenEmbed } from "./editor.ts";

const levelPanel = (page: Page) =>
	page.getByRole("navigation", { name: "Levels" });
const levelButtons = (page: Page) =>
	levelPanel(page).getByRole("listitem").getByRole("button");
const showLevel = (page: Page, name: string) =>
	levelPanel(page).getByRole("button", { name, exact: false }).click();
const shownLevel = (page: Page) =>
	levelPanel(page).locator('[aria-current="true"]');

test("adds, renames and reorders Levels, each with its own Spaces, all kept after a reload", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await editor.drag({ x: 2, y: 2 }, { x: 10, y: 10 });
	await expect(editor.spaces).toHaveCount(1);

	await levelPanel(page).getByRole("button", { name: "+ Level above" }).click();
	await expect(shownLevel(page)).toHaveText("1Level 1");
	await expect(editor.spaces).toHaveCount(0);
	await editor.drag({ x: 2, y: 2 }, { x: 6, y: 6 });
	await editor.drag({ x: 8, y: 2 }, { x: 12, y: 6 });
	await expect(editor.spaces).toHaveCount(2);

	await levelPanel(page).getByRole("button", { name: "Rename" }).click();
	await page.getByLabel("Level name").fill("First floor");
	await page.getByLabel("Level name").press("Enter");
	await levelPanel(page).getByRole("button", { name: "Move down" }).click();
	await expect(levelButtons(page)).toHaveText([
		"1Ground floor",
		"0First floor",
	]);
	await expect(page.getByTestId("save-status")).toHaveText("All changes saved");

	await page.reload();

	// It opens on floor 0, which is now the First floor.
	await expect(levelButtons(page)).toHaveText([
		"1Ground floor",
		"0First floor",
	]);
	await expect(shownLevel(page)).toHaveText("0First floor");
	await expect(editor.spaces).toHaveCount(2);
	await showLevel(page, "Ground floor");
	await expect(editor.spaces).toHaveCount(1);
});

test("deleting a Level warns about its Spaces, and undo brings them back", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await levelPanel(page).getByRole("button", { name: "+ Level below" }).click();
	await expect(shownLevel(page)).toHaveText("-1Basement");
	await editor.drag({ x: 2, y: 2 }, { x: 10, y: 10 });

	await levelPanel(page).getByRole("button", { name: "Delete" }).click();
	await expect(levelPanel(page).getByRole("alert")).toContainText(
		"Delete Basement and its 1 Space?",
	);
	await levelPanel(page).getByRole("button", { name: "Delete Level" }).click();
	await expect(levelButtons(page)).toHaveText(["0Ground floor"]);
	await expect(shownLevel(page)).toHaveText("0Ground floor");
	// The last Level can't be deleted.
	await expect(
		levelPanel(page).getByRole("button", { name: "Delete" }),
	).toBeDisabled();

	await page.keyboard.press("Control+z");
	await expect(levelButtons(page)).toHaveText(["0Ground floor", "-1Basement"]);
	await showLevel(page, "Basement");
	await expect(editor.spaces).toHaveCount(1);
});

test("the Embed switches Levels, and its directory says which floor each place is on", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await placeListing(page, editor, 2, "Boots");
	await levelPanel(page).getByRole("button", { name: "+ Level above" }).click();
	await placeListing(page, editor, 2, "Zara");
	await expect(page.getByTestId("save-status")).toHaveText("All changes saved");

	await publishAndOpenEmbed(page);

	const switcher = page.getByRole("navigation", { name: "Levels" });
	await expect(switcher.getByRole("button")).toHaveText([
		"Level 1",
		"Ground floor",
	]);
	await expect(
		switcher.getByRole("button", { name: "Ground floor" }),
	).toHaveAttribute("aria-pressed", "true");
	const results = page.getByRole("list").getByRole("button");
	await expect(results).toHaveText([/Boots.*Ground floor/, /Zara.*Level 1/]);
	await expect(page.locator(".label", { hasText: "Boots" })).toBeVisible();
	await expect(page.locator(".label", { hasText: "Zara" })).toBeHidden();

	// Choosing a place on another floor goes there.
	await results.filter({ hasText: "Zara" }).click();
	await expect(
		switcher.getByRole("button", { name: "Level 1" }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator(".label", { hasText: "Zara" })).toBeVisible();
	await expect(page.locator(".label", { hasText: "Boots" })).toBeHidden();

	await switcher.getByRole("button", { name: "Ground floor" }).click();
	await expect(page.locator(".label", { hasText: "Boots" })).toBeVisible();
});
