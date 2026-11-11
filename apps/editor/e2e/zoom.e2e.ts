import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("switching tools keeps your zoom, even when the toolbar grows", async ({
	page,
}) => {
	// Narrow enough that a tool's options wrap the toolbar onto another line.
	await page.setViewportSize({ width: 1280, height: 900 });
	const editor = await openEditor(page);
	const box = await editor.canvas.boundingBox();
	if (!box) throw new Error("canvas missing");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);
	const zoomed = await editor.canvas.getAttribute("data-scale");

	for (const key of ["f", "k", "a", "b"]) {
		await page.keyboard.press(key);
		await expect(editor.canvas).toHaveAttribute("data-scale", zoomed ?? "");
	}
});

test("shortcuts still work after ticking a checkbox or moving a slider", async ({
	page,
}) => {
	await openEditor(page, { samplePlan: false });
	const toolButton = (name: RegExp) =>
		page
			.getByRole("toolbar", { name: "Drawing tools" })
			.getByRole("button", { name });

	await page.getByLabel("Snap to 0.5 m grid").check();
	await page.keyboard.press("p");
	await expect(toolButton(/Pen/)).toHaveAttribute("aria-pressed", "true");

	await page.getByLabel("Plan opacity").focus();
	await page.keyboard.press("b");
	await expect(toolButton(/Box/)).toHaveAttribute("aria-pressed", "true");
});
