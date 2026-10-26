import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("draws an L-shaped Space corner by corner, closing on the first corner", async ({
	page,
}) => {
	const editor = await openEditor(page, { samplePlan: false });
	await editor.tool(/Pen/).click();

	for (const corner of [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 4 },
		{ x: 4, y: 4 },
		{ x: 4, y: 10 },
		{ x: 0, y: 10 },
		{ x: 0, y: 0 },
	]) {
		await editor.click(corner);
	}

	expect(await editor.areas()).toEqual([64]);
});
