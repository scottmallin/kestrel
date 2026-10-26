import { describe, expect, it } from "vitest";
import { findOverlaps, mergeOutlines, splitOutline } from "./boolean.ts";
import { type Point, type Polygon, polygonArea } from "./index.ts";

const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [
	{ x: x0, y: y0 },
	{ x: x1, y: y0 },
	{ x: x1, y: y1 },
	{ x: x0, y: y1 },
];

/** Order- and start-independent description of a shape, for comparing library output. */
const describeShape = (outline: Polygon) => {
	const xs = outline.map((p: Point) => p.x);
	const ys = outline.map((p: Point) => p.y);
	return {
		corners: outline.length,
		area: polygonArea(outline),
		box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
	};
};
const byLeft = (a: { box: number[] }, b: { box: number[] }) =>
	(a.box[0] ?? 0) - (b.box[0] ?? 0);

describe("splitOutline", () => {
	it("cuts a rectangle in two along a line drawn across it", () => {
		const pieces = splitOutline(
			rect(0, 0, 10, 8),
			{ x: 4, y: -1 },
			{ x: 4, y: 9 },
		);
		expect(pieces?.map(describeShape).sort(byLeft)).toEqual([
			{ corners: 4, area: 32, box: [0, 0, 4, 8] },
			{ corners: 4, area: 48, box: [4, 0, 10, 8] },
		]);
	});

	it("refuses a line that stops inside the shape", () => {
		expect(
			splitOutline(rect(0, 0, 10, 8), { x: 4, y: -1 }, { x: 4, y: 5 }),
		).toBeNull();
	});

	it("refuses a line that misses the shape", () => {
		expect(
			splitOutline(rect(0, 0, 10, 8), { x: 20, y: -1 }, { x: 20, y: 9 }),
		).toBeNull();
	});

	describe("a U-shaped Space", () => {
		// Base 30 x 10, with two 10 x 10 arms rising from each end. Area 500.
		const u: Polygon = [
			{ x: 0, y: 0 },
			{ x: 30, y: 0 },
			{ x: 30, y: 20 },
			{ x: 20, y: 20 },
			{ x: 20, y: 10 },
			{ x: 10, y: 10 },
			{ x: 10, y: 20 },
			{ x: 0, y: 20 },
		];

		it("cuts only the arm the line crosses", () => {
			const pieces = splitOutline(u, { x: -1, y: 15 }, { x: 15, y: 15 });
			expect(pieces?.map(polygonArea).sort((p, q) => p - q)).toEqual([50, 450]);
		});

		it("cuts both arms when the line crosses both", () => {
			const pieces = splitOutline(u, { x: -1, y: 15 }, { x: 31, y: 15 });
			expect(pieces?.map(polygonArea).sort((p, q) => p - q)).toEqual([
				50, 50, 400,
			]);
		});
	});
});

describe("mergeOutlines", () => {
	it("joins two touching rectangles into one, without corners along the old shared wall", () => {
		const merged = mergeOutlines([rect(0, 0, 10, 8), rect(10, 0, 20, 8)]);
		expect(merged && describeShape(merged)).toEqual({
			corners: 4,
			area: 160,
			box: [0, 0, 20, 8],
		});
	});

	it("refuses shapes that don't touch", () => {
		expect(mergeOutlines([rect(0, 0, 10, 8), rect(12, 0, 20, 8)])).toBeNull();
	});
});

describe("findOverlaps", () => {
	it("reports which outlines overlap, and where", () => {
		const overlaps = findOverlaps(
			[rect(0, 0, 10, 8), rect(20, 0, 30, 8), rect(8, 0, 18, 8)],
			0.01,
		);
		expect(overlaps).toHaveLength(1);
		expect(overlaps[0]?.between).toEqual([0, 2]);
		expect(overlaps[0] && describeShape(overlaps[0].region)).toEqual({
			corners: 4,
			area: 16,
			box: [8, 0, 10, 8],
		});
	});

	it("ignores neighbours that only share a wall", () => {
		expect(findOverlaps([rect(0, 0, 10, 8), rect(10, 0, 20, 8)], 0.01)).toEqual(
			[],
		);
	});

	it("ignores slivers smaller than the minimum area", () => {
		expect(
			findOverlaps([rect(0, 0, 10, 8), rect(9.99, 0, 20, 8)], 0.1),
		).toEqual([]);
	});
});
