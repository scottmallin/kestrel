import { expect, type Page, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

/** Draws a box and gives it a Space Reference. */
async function drawNamedSpace(
	page: Page,
	editor: Awaited<ReturnType<typeof openEditor>>,
	x: number,
	name: string,
) {
	await editor.drag({ x, y: 2 }, { x: x + 8, y: 10 });
	await editor.click({ x: x + 4, y: 6 });
	await page.getByLabel("Space Reference").fill(name);
	await page.getByLabel("Space Reference").press("Enter");
	await page.keyboard.press("Escape");
}

async function publishAndOpenEmbed(page: Page) {
	// Any console error in the Embed fails the test (e.g. the map's rendering worker not loading).
	page.on("console", (message) => {
		if (message.type() === "error" && page.url().includes("embed="))
			throw new Error(
				`Embed console error: ${message.text()} (${message.location().url})`,
			);
	});
	await page.getByRole("button", { name: "Publish" }).click();
	const code = await page.getByLabel("Embed code").inputValue();
	const src = code.match(/src="([^"]+)"/)?.[1];
	if (!src) throw new Error(`No src in embed code: ${code}`);
	await page.goto(src);
	return src;
}

test("publishes a Map and shows it in the Embed, with a searchable directory", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await drawNamedSpace(page, editor, 2, "Unit 1");
	await drawNamedSpace(page, editor, 14, "Unit 2");
	await expect(page.getByTestId("save-status")).toHaveText("All changes saved");

	await publishAndOpenEmbed(page);

	await expect(page.getByRole("heading", { name: "Test mall" })).toBeVisible();
	await expect(page.locator(".maplibregl-canvas")).toBeVisible();
	const results = page.getByRole("list").getByRole("button");
	await expect(results).toHaveText([/Unit 1/, /Unit 2/]);
	await expect(page.getByRole("status")).toHaveText("2 places");

	await page.getByLabel("Find a place").fill("2");
	await expect(results).toHaveText([/Unit 2/]);
	await expect(page.getByRole("status")).toHaveText("1 place");
});

test("the Embed's directory works from the keyboard alone", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await drawNamedSpace(page, editor, 2, "Unit 1");
	await publishAndOpenEmbed(page);
	await expect(page.getByLabel("Find a place")).toBeEnabled();

	await page.keyboard.press("Tab");
	await expect(page.getByLabel("Find a place")).toBeFocused();
	await page.keyboard.type("unit");
	await page.keyboard.press("Tab");
	const unit1 = page.getByRole("button", { name: /Unit 1/ });
	await expect(unit1).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(unit1).toHaveAttribute("aria-pressed", "true");
});

test("publishing again updates the same Embed", async ({ page }) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await drawNamedSpace(page, editor, 2, "Unit 1");
	await page.getByRole("button", { name: "Publish" }).click();
	const firstCode = await page.getByLabel("Embed code").inputValue();
	await page.getByRole("button", { name: "Close" }).click();

	await drawNamedSpace(page, editor, 14, "Unit 2");
	const src = await publishAndOpenEmbed(page);

	expect(firstCode).toContain(src);
	await expect(page.getByRole("list").getByRole("button")).toHaveText([
		/Unit 1/,
		/Unit 2/,
	]);
});
