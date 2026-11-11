import { expect, test } from "@playwright/test";
import { openEditor, publishAndOpenEmbed } from "./editor.ts";

test("the editor and the Embed have a key to the Space Kinds on the floor shown", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await editor.drag({ x: 0, y: 0 }, { x: 10, y: 8 });
	await editor.drag({ x: 12, y: 0 }, { x: 16, y: 8 });
	await editor.click({ x: 14, y: 4 });
	await page.getByLabel("Space Kind").selectOption("escalator");
	await page.keyboard.press("Escape");

	const key = page.getByRole("region", { name: "Key" });
	await expect(key).toContainText("Unit");
	await expect(key).toContainText("Escalator");
	await expect(key).not.toContainText("Overlapping");
	await editor.drag({ x: 8, y: 6 }, { x: 13, y: 10 });
	await expect(key).toContainText("Overlapping");
	await page.keyboard.press("Control+z");

	await page
		.getByRole("navigation", { name: "Levels" })
		.getByRole("button", { name: "+ Level above" })
		.click();
	await editor.drag({ x: 0, y: 0 }, { x: 6, y: 6 });
	await editor.click({ x: 3, y: 3 });
	await page.getByLabel("Space Kind").selectOption("toilet");
	await page.keyboard.press("Escape");
	await expect(key).toHaveText(/^Toilets$/);

	await publishAndOpenEmbed(page);
	// The Embed opens on the ground floor, with the key folded away.
	const embedKey = page.locator("#key");
	await embedKey.getByText("Key").click();
	await expect(embedKey.getByRole("listitem")).toHaveText([
		"Unit",
		"Escalator",
	]);
	await page
		.getByRole("navigation", { name: "Levels" })
		.getByRole("button", { name: "Level 1" })
		.click();
	await expect(embedKey.getByRole("listitem")).toHaveText(["Toilets"]);
});
