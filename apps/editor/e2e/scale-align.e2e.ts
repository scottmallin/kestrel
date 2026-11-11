import { expect, type Page, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

/** The saved Draft, read through the API with the page's sign-in. */
async function savedDraft(page: Page) {
	await expect(page.getByTestId("save-status")).toHaveText("All changes saved");
	const mapId = new URL(page.url()).searchParams.get("map");
	const response = await page.request.get(`/api/maps/${mapId}/draft`);
	return (await response.json()).draft;
}

const tool = (page: Page, name: RegExp) =>
	page
		.getByRole("toolbar", { name: "Drawing tools" })
		.getByRole("button", { name });
const levelPanel = (page: Page) =>
	page.getByRole("navigation", { name: "Levels" });

async function setScale(
	page: Page,
	editor: Awaited<ReturnType<typeof openEditor>>,
	from: { x: number; y: number },
	to: { x: number; y: number },
	metres: number,
) {
	await page.keyboard.press("k");
	await editor.click(from);
	await editor.click(to);
	await page.getByLabel("Real length in metres").fill(String(metres));
	await page.getByLabel("Real length in metres").press("Enter");
	await expect(editor.status).toContainText("Scale set");
}

test("a floor plan locks drawing on its Level until the scale is set", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await page.getByRole("button", { name: "Use sample plan" }).click();
	await expect(editor.canvas).not.toHaveAttribute("data-scale", "20");

	await expect(tool(page, /Box/)).toBeDisabled();
	await expect(tool(page, /Magic fill/)).toBeDisabled();
	await expect(tool(page, /Set scale/)).toHaveAttribute("aria-pressed", "true");
	await expect(
		levelPanel(page).getByRole("region", { name: "Set up this Level" }),
	).toContainText("Set its scale");

	await setScale(page, editor, { x: 2, y: 2 }, { x: 12, y: 2 }, 20);

	await expect(tool(page, /Box/)).toBeEnabled();
	await expect(
		levelPanel(page).getByRole("region", { name: "Set up this Level" }),
	).toHaveCount(0);
});

test("setting the scale on a blank grid rescales what's drawn, and undo puts it back", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await editor.drag({ x: 2, y: 2 }, { x: 12, y: 10 });
	expect(await editor.areas()).toEqual([80]);

	await setScale(page, editor, { x: 2, y: 2 }, { x: 12, y: 2 }, 20);

	// Twice as long each way: four times the area.
	await expect.poll(() => editor.areas()).toEqual([320]);
	expect((await savedDraft(page)).scaleSet).toBe(true);

	await page.keyboard.press("Control+z");
	await expect.poll(() => editor.areas()).toEqual([80]);
	expect((await savedDraft(page)).scaleSet).toBe(false);
});

test("another floor's plan gets its own scale, then is aligned, before drawing on it", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await editor.drag({ x: 0, y: 0 }, { x: 20, y: 10 });
	// Align needs a scale: set the Building's on the blank ground floor (20 m stays 20 m).
	await expect(tool(page, /Align plan/)).toBeDisabled();
	await setScale(page, editor, { x: 0, y: 0 }, { x: 20, y: 0 }, 20);
	await page.keyboard.press("Escape");

	await levelPanel(page).getByRole("button", { name: "+ Level above" }).click();
	await expect(tool(page, /Box/)).toBeEnabled(); // a blank grid is ready straight away
	await page.getByRole("button", { name: "Use sample plan" }).click();
	await expect(tool(page, /Box/)).toBeDisabled();
	await expect(tool(page, /Align plan/)).toBeDisabled();
	await expect(tool(page, /Set scale/)).toHaveAttribute("aria-pressed", "true");
	await expect(levelPanel(page)).toContainText("Set scale");

	// This plan's own scale: 200 px (10 m at the default 20 px/m) is really 20 m, so 0.1 m per pixel.
	await editor.click({ x: 5, y: 5 });
	await editor.click({ x: 15, y: 5 });
	await expect(page.getByText("this floor's plan only")).toBeVisible();
	await page.getByLabel("Real length in metres").fill("20");
	await page.getByLabel("Real length in metres").press("Enter");
	// Straight on to aligning; the ground floor's Space is untouched.
	await expect(tool(page, /Align plan/)).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(tool(page, /Box/)).toBeDisabled();
	await expect(levelPanel(page)).toContainText("✓ Scale set");

	// At 0.1 m per pixel, pixel (100, 100) is at (10, 10) m and pixel (300, 100) at (30, 10) m.
	await expect(editor.status).toContainText("Click a point on this plan");
	await editor.click({ x: 10, y: 10 });
	await expect(editor.status).toContainText(
		"same point on the ghost of Ground floor",
	);
	await editor.click({ x: 0, y: 0 });
	await editor.click({ x: 30, y: 10 });
	// A wrong match: 15 m apart on the ghost but 20 m on the plan.
	await editor.click({ x: 15, y: 0 });
	await expect(editor.status).toContainText("25% closer together");
	await expect(tool(page, /Box/)).toBeDisabled();

	await editor.click({ x: 10, y: 10 });
	await editor.click({ x: 0, y: 0 });
	await editor.click({ x: 30, y: 10 });
	await editor.click({ x: 20, y: 0 });
	await expect(editor.status).toContainText("Plan aligned to Ground floor");
	await expect(tool(page, /Box/)).toBeEnabled();

	// It kept its measured scale, and moved so pixel (100, 100) sits at (0, 0).
	const draft = await savedDraft(page);
	expect(Object.values(draft.spaces)).toHaveLength(1);
	const levelOne = Object.values(draft.levels).find(
		(l) => (l as { name: string }).name === "Level 1",
	) as { id: string };
	const placed = draft.placements[levelOne.id];
	expect(placed.scale).toBeCloseTo(0.1, 6);
	expect(placed.rotation).toBeCloseTo(0, 2);
	expect(placed.x).toBeCloseTo(-10, 0);
	expect(placed.y).toBeCloseTo(-10, 0);
	expect(draft.unaligned).toEqual({});

	// A new image might be framed differently, so it starts again.
	await page.getByRole("button", { name: "Use sample plan" }).click();
	await expect(tool(page, /Box/)).toBeDisabled();
	await expect(editor.status).toContainText("set its scale and align it");
});
