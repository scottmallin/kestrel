import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("fills a room from the plan and keeps it with Enter", async ({ page }) => {
	const editor = await openEditor(page);
	await page.keyboard.press("f");

	await editor.click({ x: 7.6, y: 10 }); // inside Unit 1
	await expect(editor.status).toContainText("Enter or click inside");
	await page.keyboard.press("Enter");

	await expect(editor.spaces).toHaveCount(1);
	const [area] = await editor.areas();
	expect(area).toBeGreaterThan(170);
	expect(area).toBeLessThan(178);
});

test("closing a wide opening keeps the fill inside the room", async ({
	page,
}) => {
	const editor = await openEditor(page);
	await page.keyboard.press("f");

	// The anchor store's 3m shopfront is wider than the door gap, so the fill spills into the corridor.
	await editor.click({ x: 44, y: 32 });
	await page.keyboard.press("Enter");
	const [spilled] = await editor.areas();
	expect(spilled).toBeGreaterThan(400);
	await page.keyboard.press("Control+z");

	// Close the shopfront with a line, then fill again.
	await editor.drag({ x: 41.5, y: 22 }, { x: 45.5, y: 22 });
	await editor.click({ x: 44, y: 32 });
	await page.keyboard.press("Enter");
	const [anchor] = await editor.areas();
	expect(anchor).toBeGreaterThan(290);
	expect(anchor).toBeLessThan(315);
});

test("explains a click on a wall", async ({ page }) => {
	const editor = await openEditor(page);
	await page.keyboard.press("f");
	await editor.click({ x: 2, y: 10 }); // Unit 1's left wall
	await expect(editor.status).toContainText("on a wall");
});
