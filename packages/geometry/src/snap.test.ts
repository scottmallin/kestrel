import { describe, expect, it } from "vitest";
import type { Polygon } from "./index.ts";
import { snap } from "./snap.ts";

// A 10 x 8 room with its corner at the origin.
const room: Polygon = [
	{ x: 0, y: 0 },
	{ x: 10, y: 0 },
	{ x: 10, y: 8 },
	{ x: 0, y: 8 },
];

describe("snap", () => {
	it("leaves the point alone when nothing is in range", () => {
		expect(snap({ x: 30, y: 30 }, { outlines: [room], tolerance: 1 })).toEqual({
			point: { x: 30, y: 30 },
			kind: "none",
			guides: [],
		});
	});

	it("snaps to a nearby corner", () => {
		expect(
			snap({ x: 10.4, y: -0.3 }, { outlines: [room], tolerance: 1 }),
		).toMatchObject({
			point: { x: 10, y: 0 },
			kind: "corner",
		});
	});

	it("snaps onto a nearby edge at the closest point along it", () => {
		expect(
			snap({ x: 4, y: 8.6 }, { outlines: [room], tolerance: 1 }),
		).toMatchObject({
			point: { x: 4, y: 8 },
			kind: "edge",
		});
	});

	it("picks the closest corner when several are in range", () => {
		const neighbour = room.map((p) => ({ x: p.x + 10.5, y: p.y }));
		expect(
			snap({ x: 10.4, y: 0.1 }, { outlines: [room, neighbour], tolerance: 1 })
				.point,
		).toEqual({
			x: 10.5,
			y: 0,
		});
	});

	describe("while drawing", () => {
		const path = [
			{ x: 20, y: 0 },
			{ x: 30, y: 0 },
			{ x: 30, y: 8 },
		];

		it("offers to close the shape near its first corner", () => {
			expect(
				snap(
					{ x: 20.3, y: 0.4 },
					{ outlines: [], tolerance: 1, drawing: path },
				),
			).toMatchObject({
				point: { x: 20, y: 0 },
				kind: "close",
			});
		});

		it("prefers closing over a neighbour's corner on the same spot", () => {
			const neighbour = room.map((p) => ({ x: p.x + 10, y: p.y }));
			expect(
				snap(
					{ x: 20.1, y: 0.1 },
					{ outlines: [neighbour], tolerance: 1, drawing: path },
				).kind,
			).toBe("close");
		});

		it("straightens a nearly-vertical line from the last corner", () => {
			const result = snap(
				{ x: 30.3, y: 6 },
				{ outlines: [], tolerance: 0.1, drawing: path.slice(0, 2) },
			);
			expect(result.kind).toBe("angle");
			expect(result.point.x).toBeCloseTo(30);
			expect(result.point.y).toBeCloseTo(6, 1);
		});

		it("leaves a clearly diagonal line alone", () => {
			const result = snap(
				{ x: 33, y: 5 },
				{ outlines: [], tolerance: 0.1, drawing: path.slice(0, 2) },
			);
			expect(result).toMatchObject({ point: { x: 33, y: 5 }, kind: "none" });
		});
	});

	describe("alignment", () => {
		it("lines a point up with a corner's x, with a guide from the nearest such corner", () => {
			expect(
				snap({ x: 10.4, y: 20 }, { outlines: [room], tolerance: 1 }),
			).toEqual({
				point: { x: 10, y: 20 },
				kind: "align",
				guides: [
					[
						{ x: 10, y: 8 },
						{ x: 10, y: 20 },
					],
				],
			});
		});

		it("lines up on both axes at once", () => {
			const other: Polygon = [
				{ x: 30, y: 20 },
				{ x: 40, y: 20 },
				{ x: 40, y: 30 },
			];
			const result = snap(
				{ x: 9.6, y: 20.5 },
				{ outlines: [room, other], tolerance: 1 },
			);
			expect(result.point).toEqual({ x: 10, y: 20 });
			expect(result.guides).toHaveLength(2);
		});
	});

	describe("grid", () => {
		it("rounds to the grid when nothing else is in range", () => {
			expect(
				snap(
					{ x: 31.2, y: 24.8 },
					{ outlines: [room], tolerance: 0.5, grid: 0.5 },
				),
			).toMatchObject({
				point: { x: 31, y: 25 },
				kind: "grid",
			});
		});

		it("gives way to corners", () => {
			expect(
				snap({ x: 10.3, y: 0.3 }, { outlines: [room], tolerance: 0.5, grid: 4 })
					.kind,
			).toBe("corner");
		});
	});

	describe("dragging a corner", () => {
		it("ignores the dragged corner and its own edges, but still aligns with the others", () => {
			const result = snap(
				{ x: 10.3, y: 8.2 },
				{ outlines: [room], tolerance: 1, exclude: { outline: 0, corner: 2 } },
			);
			expect(result.kind).toBe("align");
			expect(result.point).toEqual({ x: 10, y: 8 });
		});
	});
});
