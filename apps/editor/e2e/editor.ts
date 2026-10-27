import { expect, type Page } from "@playwright/test";

type Metres = { x: number; y: number };

let users = 0;

/** Signs up a new user (with their own Organisation) and creates a Map, ending in the editor. */
export async function signUpAndCreateMap(page: Page, mapName = "Test mall") {
	users++;
	await page.goto("/");
	await page
		.getByRole("button", { name: "New here? Create an account" })
		.click();
	await page.getByLabel("Your name").fill("Test User");
	await page.getByLabel("Organisation").fill("Test Org");
	await page
		.getByLabel("Email")
		.fill(
			`user-${Date.now()}-${users}-${Math.random().toString(36).slice(2)}@example.com`,
		);
	await page.getByLabel("Password").fill("correct horse battery");
	await page.getByRole("button", { name: "Create account" }).click();
	await page.getByLabel("New Map").fill(mapName);
	await page.getByRole("button", { name: "Create" }).click();
	await expect(page.getByTestId("level-canvas")).toBeVisible();
}

/** Opens the editor on a new Map, then drives it in plan coordinates (metres) using the canvas's data-scale and origin. */
export async function openEditor(
	page: Page,
	{ samplePlan = true, grid = false } = {},
) {
	await signUpAndCreateMap(page);
	// Mouse positions land on whole screen pixels; the grid makes drawn sizes exact.
	if (grid) await page.getByLabel("Snap to 0.5 m grid").check();
	if (samplePlan) {
		await page.getByRole("button", { name: "Use sample plan" }).click();
		// Wait for the view to fit the plan, so coordinates are stable.
		await expect(page.getByTestId("level-canvas")).not.toHaveAttribute(
			"data-scale",
			"20",
		);
	}
	const canvas = page.getByTestId("level-canvas");

	const toScreen = async ({ x, y }: Metres) => {
		const box = await canvas.boundingBox();
		const scale = Number(await canvas.getAttribute("data-scale"));
		const originX = Number(await canvas.getAttribute("data-origin-x"));
		const originY = Number(await canvas.getAttribute("data-origin-y"));
		if (!box) throw new Error("Canvas not visible");
		return { x: box.x + originX + x * scale, y: box.y + originY + y * scale };
	};

	const editor = {
		canvas,
		spaces: page
			.getByRole("complementary", { name: "Spaces" })
			.getByRole("listitem"),
		status: page.getByRole("status"),
		async click(at: Metres) {
			const p = await toScreen(at);
			await page.mouse.click(p.x, p.y);
		},
		async drag(from: Metres, to: Metres) {
			const a = await toScreen(from);
			const b = await toScreen(to);
			await page.mouse.move(a.x, a.y);
			await page.mouse.down();
			await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
			await page.mouse.move(b.x, b.y, { steps: 4 });
			await page.mouse.up();
		},
		/** Areas listed in the side panel, in m². */
		async areas() {
			const texts = await editor.spaces.allInnerTexts();
			return texts.map((t) => Number(t.match(/([\d.]+) m²/)?.[1]));
		},
		tool: (name: RegExp) =>
			page
				.getByRole("toolbar", { name: "Drawing tools" })
				.getByRole("button", { name }),
	};
	return editor;
}
