import { describe, expect, it } from "vitest";
import { polygonArea } from "./index.ts";

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
