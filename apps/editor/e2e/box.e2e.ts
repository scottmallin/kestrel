import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("draws boxes that snap to each other without overlapping", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true });

	await editor.drag({ x: 2, y: 2 }, { x: 13, y: 18 });
	// Start the second box right on the first one's corner; it must snap there, not grab a handle.
	await editor.drag({ x: 13.05, y: 2 }, { x: 24, y: 18 });

	await expect(editor.spaces).toHaveCount(2);
	expect(await editor.areas()).toEqual([176, 176]);
	await expect(page.getByText(/overlapping/)).toHaveCount(0);
});

test("reshapes a Space by pushing a wall, and undo puts it back", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true });
	await editor.drag({ x: 2, y: 2 }, { x: 12, y: 12 });

	await editor.click({ x: 7, y: 7 });
	// Push the right-hand wall (its square sits at the wall's midpoint) out by 3m.
	await editor.drag({ x: 12, y: 7 }, { x: 15, y: 7.4 });
	expect(await editor.areas()).toEqual([130]);

	await page.keyboard.press("Control+z");
	expect(await editor.areas()).toEqual([100]);
});

test("splits a Space with a line, as one undo step", async ({ page }) => {
	const editor = await openEditor(page, { grid: true });
	await editor.drag({ x: 2, y: 2 }, { x: 12, y: 10 });

	await page.keyboard.press("s");
	await editor.drag({ x: 6, y: 0 }, { x: 6, y: 12 });
	expect((await editor.areas()).sort()).toEqual([32, 48]);

	await page.keyboard.press("Control+z");
	expect(await editor.areas()).toEqual([80]);
});

test("names a Space from the side panel", async ({ page }) => {
	const editor = await openEditor(page, { grid: true });
	await editor.drag({ x: 2, y: 2 }, { x: 12, y: 10 });
	await editor.click({ x: 7, y: 6 });

	await page.getByLabel("Space Reference").fill("Unit 1");
	await page.getByLabel("Space Reference").press("Enter");
	await page.getByLabel("Space Kind").selectOption("toilet");

	await expect(editor.spaces.first()).toContainText("Unit 1");
	await page.keyboard.press("Control+z");
	await page.keyboard.press("Control+z");
	await expect(editor.spaces.first()).toContainText("unit");
});
