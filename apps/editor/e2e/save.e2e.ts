import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("keeps the floor plan and Spaces after a reload", async ({ page }) => {
	const editor = await openEditor(page, { grid: true });
	await editor.drag({ x: 2, y: 2 }, { x: 13, y: 18 });
	await expect(page.getByTestId("save-status")).toHaveText("All changes saved");

	await page.reload();

	await expect(editor.spaces).toHaveCount(1);
	expect(await editor.areas()).toEqual([176]);
	// The floor plan came back too: the view fits it rather than the empty default.
	await expect(editor.canvas).not.toHaveAttribute("data-scale", "20");
});

test("saves undo like any other edit", async ({ page }) => {
	const editor = await openEditor(page, { grid: true });
	await editor.drag({ x: 2, y: 2 }, { x: 13, y: 18 });
	await editor.drag({ x: 15, y: 2 }, { x: 24, y: 18 });
	await page.keyboard.press("Control+z");
	await expect(editor.spaces).toHaveCount(1);
	await expect(page.getByTestId("save-status")).toHaveText("All changes saved");

	await page.reload();

	await expect(editor.spaces).toHaveCount(1);
});

test("tells you when the Map was changed in another tab, and offers a reload", async ({
	page,
	context,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	const other = await context.newPage();
	await other.goto(page.url());
	await expect(other.getByTestId("level-canvas")).toBeVisible();

	// Edit in the second tab first, so the first tab's next save is out of date.
	await other.keyboard.press("p");
	const box = await other.getByTestId("level-canvas").boundingBox();
	if (!box) throw new Error("canvas missing");
	for (const [x, y] of [
		[100, 100],
		[300, 100],
		[300, 300],
		[100, 100],
	] as const) {
		await other.mouse.click(box.x + x, box.y + y);
	}
	await expect(other.getByTestId("save-status")).toHaveText(
		"All changes saved",
	);

	await editor.drag({ x: 2, y: 2 }, { x: 8, y: 8 });

	await expect(page.getByRole("alert")).toContainText("changed elsewhere");
	await page.getByRole("button", { name: "Reload the Map" }).click();
	await expect(editor.spaces).toHaveCount(1);
});
