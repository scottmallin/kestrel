import { describe, expect, it } from "vitest";
import { containsPoint, polygonArea } from "./index.ts";

describe("polygonArea", () => {
	it("measures a 4m x 3m rectangle", () => {
		const rect = [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 4, y: 3 },
			{ x: 0, y: 3 },
		];
		expect(polygonArea(rect)).toBe(12);
	});

	it("ignores winding direction", () => {
		const clockwise = [
			{ x: 0, y: 0 },
			{ x: 0, y: 3 },
			{ x: 4, y: 3 },
			{ x: 4, y: 0 },
		];
		expect(polygonArea(clockwise)).toBe(12);
	});
});

describe("containsPoint", () => {
	const l = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 4 },
		{ x: 4, y: 4 },
		{ x: 4, y: 10 },
		{ x: 0, y: 10 },
	];

	it("is true inside an L-shape and false in its notch", () => {
		expect(containsPoint(l, { x: 2, y: 8 })).toBe(true);
		expect(containsPoint(l, { x: 8, y: 2 })).toBe(true);
		expect(containsPoint(l, { x: 8, y: 8 })).toBe(false);
	});
});
