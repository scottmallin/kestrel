import { describe, expect, it } from "vitest";
import { legendFor, SPACE_KIND_COLOURS } from "./style.ts";

describe("legendFor", () => {
	it("has one entry per colour, naming the kinds that share it", () => {
		expect(legendFor(["escalator", "unit", "lift", "unit"])).toEqual([
			{ colour: SPACE_KIND_COLOURS.unit, label: "Unit" },
			{ colour: SPACE_KIND_COLOURS.lift, label: "Lift, Escalator" },
		]);
	});

	it("is empty for a Level with nothing drawn", () => {
		expect(legendFor([])).toEqual([]);
	});
});

describe("SPACE_KIND_COLOURS", () => {
	it("tells ways between floors apart from units", () => {
		for (const kind of ["stairs", "lift", "escalator"] as const)
			expect(SPACE_KIND_COLOURS[kind]).not.toBe(SPACE_KIND_COLOURS.unit);
		expect(SPACE_KIND_COLOURS.void).not.toBe(SPACE_KIND_COLOURS["car-park"]);
	});
});
