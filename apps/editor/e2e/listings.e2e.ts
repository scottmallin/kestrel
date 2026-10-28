import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openEditor, placeListing, publishAndOpenEmbed } from "./editor.ts";

const logoFile = fileURLToPath(
	new URL("../public/sample-plan.svg", import.meta.url),
);

test("Listings made without a Space show as Unplaced until placed on the map", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await page.getByRole("tab", { name: /Listings/ }).click();
	await page.getByLabel("New Listing").fill("HMV");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await page.getByLabel(/Only Unplaced/).check();
	await expect(
		page.getByRole("region", { name: "Listings" }).getByRole("listitem"),
	).toHaveText([/HMV.*Unplaced/]);

	await page.getByRole("tab", { name: /Spaces/ }).click();
	await editor.drag({ x: 2, y: 2 }, { x: 10, y: 10 });
	await editor.click({ x: 6, y: 6 });
	await page.getByLabel("Add a Listing").fill("hm");
	await page.getByRole("button", { name: "Place HMV here" }).click();

	await page.getByRole("tab", { name: /Listings/ }).click();
	await expect(page.getByLabel("Only Unplaced (0)")).toBeVisible();
});

test("splitting a Space keeps its Listing on the first piece", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await placeListing(page, editor, 2, "Boots");

	await page.keyboard.press("s");
	await editor.drag({ x: 6, y: 0 }, { x: 6, y: 12 });
	await page.keyboard.press("b");
	await expect(editor.spaces).toHaveCount(2);

	await page.getByRole("tab", { name: /Listings/ }).click();
	await expect(page.getByLabel("Only Unplaced (0)")).toBeVisible();
});

test("a Listing's Category and logo reach the Embed, with a Category filter and details card", async ({
	page,
}) => {
	const editor = await openEditor(page, { grid: true, samplePlan: false });
	await placeListing(page, editor, 2, "Boots");
	await placeListing(page, editor, 14, "Zara");

	// Open Boots from its Space and give it a Category, logo and website.
	await editor.click({ x: 6, y: 6 });
	await page
		.getByRole("region", { name: "Selected Space" })
		.getByRole("button", { name: "Boots", exact: true })
		.click();
	await page.getByLabel("New Category").fill("Health & beauty");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page.getByRole("combobox", { name: /Category/ })).toHaveValue(
		/.+/,
	);
	await page.getByLabel("Logo file").setInputFiles(logoFile);
	await expect(page.getByRole("img", { name: "Boots logo" })).toBeVisible();
	await page.getByLabel("Website").fill("boots.com");
	await page.getByLabel("Website").press("Enter");
	await expect(page.getByTestId("save-status")).toHaveText("All changes saved");

	await publishAndOpenEmbed(page);

	await expect(page.getByRole("list").getByRole("button")).toHaveText([
		/Boots.*Health & beauty/,
		/Zara/,
	]);
	await page.getByLabel("Category").selectOption({ label: "Health & beauty" });
	await expect(page.getByRole("list").getByRole("button")).toHaveText([
		/Boots/,
	]);

	await page.getByRole("button", { name: /Boots/ }).click();
	const card = page.locator("#details");
	await expect(card.getByRole("heading", { name: "Boots" })).toBeVisible();
	await expect(card.getByRole("img", { name: "Boots logo" })).toBeVisible();
	await expect(
		card.getByRole("link", { name: "Visit website" }),
	).toHaveAttribute("href", "https://boots.com");
});
