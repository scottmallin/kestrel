import { expect, type Page, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

/** The saved Draft, read through the API with the page's sign-in. */
async function savedDraft(page: Page) {
	await expect(page.getByTestId("save-status")).toHaveText("All changes saved");
	const mapId = new URL(page.url()).searchParams.get("map");
	const response = await page.request.get(`/api/maps/${mapId}/draft`);
	return (await response.json()).draft;
}

test("setting the scale rescales the whole Building, and undo puts it back", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true });
	await editor.drag({ x: 2, y: 2 }, { x: 12, y: 10 });
	expect(await editor.areas()).toEqual([80]);

	await page.keyboard.press("k");
	await editor.click({ x: 2, y: 2 });
	await editor.click({ x: 12, y: 2 });
	await expect(page.getByText("(drawn as 10.00 m)")).toBeVisible();
	await page.getByLabel("Real length in metres").fill("20");
	await page.getByLabel("Real length in metres").press("Enter");

	await expect(editor.status).toContainText("Scale set");
	// Twice as long each way: four times the area.
	await expect.poll(() => editor.areas()).toEqual([320]);
	const draft = await savedDraft(page);
	expect(Object.values(draft.placements)).toEqual([
		{ scale: 0.1, rotation: 0, x: 0, y: 0 },
	]);

	await page.keyboard.press("Control+z");
	await expect.poll(() => editor.areas()).toEqual([80]);
	expect((await savedDraft(page)).placements).toEqual({});
});

test("aligns a second floor's plan to the ground floor by two matching points, and keeps it", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await editor.drag({ x: 0, y: 0 }, { x: 20, y: 10 });
	await page
		.getByRole("navigation", { name: "Levels" })
		.getByRole("button", { name: "+ Level above" })
		.click();
	await page.getByRole("button", { name: "Use sample plan" }).click();
	await expect(editor.canvas).not.toHaveAttribute("data-scale", "20");

	await page.keyboard.press("a");
	await expect(editor.status).toContainText("Click a point on this plan");
	await expect(page.getByLabel("Align to")).toHaveValue(/.+/);

	// Unplaced, the plan is at 20 px per metre: (5, 5) m is pixel (100, 100), (15, 5) m is (300, 100).
	await editor.click({ x: 5, y: 5 });
	await expect(editor.status).toContainText(
		"same point on the ghost of Ground floor",
	);
	await editor.click({ x: 0, y: 0 });
	await editor.click({ x: 15, y: 5 });
	await editor.click({ x: 20, y: 0 });
	await expect(editor.status).toContainText("Plan aligned to Ground floor");

	// 200 px across now spans 20 m, so 0.1 m per pixel, moved so pixel (100, 100) sits at (0, 0).
	const placed = Object.values((await savedDraft(page)).placements)[0] as {
		scale: number;
		rotation: number;
		x: number;
		y: number;
	};
	expect(placed.scale).toBeCloseTo(0.1, 2);
	expect(placed.rotation).toBeCloseTo(0, 2);
	expect(placed.x).toBeCloseTo(-10, 0);
	expect(placed.y).toBeCloseTo(-10, 0);

	await page.reload();
	await page
		.getByRole("navigation", { name: "Levels" })
		.getByRole("button", { name: /Level 1/ })
		.click();
	expect(Object.values((await savedDraft(page)).placements)).toHaveLength(1);
});
