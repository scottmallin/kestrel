import { describe, expect, it } from "vitest";
import {
	DEFAULT_PLACEMENT,
	type Placement,
	placementFromPairs,
	rescaleFactor,
	scalePlacement,
	scalePolygon,
	toImage,
	toPlane,
} from "./placement.ts";

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
	expect(a.x).toBeCloseTo(b.x, 9);
	expect(a.y).toBeCloseTo(b.y, 9);
};

const tilted: Placement = {
	scale: 0.05,
	rotation: Math.PI / 6,
	x: 12,
	y: -3,
};

describe("toPlane and toImage", () => {
	it("place an unplaced plan at 20 pixels per metre from the origin", () => {
		close(toPlane(DEFAULT_PLACEMENT, { x: 200, y: 100 }), { x: 10, y: 5 });
	});

	it("scale, then rotate, then offset", () => {
		const quarterTurn: Placement = {
			scale: 0.5,
			rotation: Math.PI / 2,
			x: 1,
			y: 2,
		};
		// (10, 0) px → (5, 0) m → rotated a quarter turn (y down) → (0, 5) → offset → (1, 7).
		close(toPlane(quarterTurn, { x: 10, y: 0 }), { x: 1, y: 7 });
	});

	it("undo each other", () => {
		const pixel = { x: 431.5, y: 77 };
		close(toImage(tilted, toPlane(tilted, pixel)), pixel);
	});
});

describe("placementFromPairs", () => {
	it("puts both points of the plan exactly on their matches", () => {
		const image = [
			{ x: 100, y: 50 },
			{ x: 900, y: 650 },
		] as const;
		const plane = [
			{ x: 3, y: 4 },
			{ x: 27, y: 46 },
		] as const;
		const placement = placementFromPairs(image, plane);
		if (!placement) throw new Error("expected a Placement");

		close(toPlane(placement, image[0]), plane[0]);
		close(toPlane(placement, image[1]), plane[1]);
	});

	it("recovers a plan drawn a quarter turn round, at a different scale", () => {
		const truth: Placement = {
			scale: 0.04,
			rotation: -Math.PI / 2,
			x: 50,
			y: 10,
		};
		const image = [
			{ x: 0, y: 0 },
			{ x: 250, y: 125 },
		] as const;
		const placement = placementFromPairs(image, [
			toPlane(truth, image[0]),
			toPlane(truth, image[1]),
		]);

		expect(placement?.scale).toBeCloseTo(0.04, 9);
		expect(placement?.rotation).toBeCloseTo(-Math.PI / 2, 9);
		close(
			toPlane(placement as Placement, { x: 600, y: 40 }),
			toPlane(truth, { x: 600, y: 40 }),
		);
	});

	it("can't work from two points in the same place", () => {
		const p = { x: 5, y: 5 };
		expect(
			placementFromPairs(
				[p, p],
				[
					{ x: 0, y: 0 },
					{ x: 1, y: 1 },
				],
			),
		).toBeNull();
		expect(
			placementFromPairs(
				[
					{ x: 0, y: 0 },
					{ x: 9, y: 9 },
				],
				[p, p],
			),
		).toBeNull();
	});
});

describe("rescaling the Building", () => {
	it("works out the factor from a line and its real length", () => {
		expect(rescaleFactor({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)).toBeCloseTo(2, 9);
		expect(rescaleFactor({ x: 1, y: 1 }, { x: 1, y: 1 }, 10)).toBeNull();
		expect(rescaleFactor({ x: 0, y: 0 }, { x: 3, y: 4 }, 0)).toBeNull();
	});

	it("scales Spaces and Placements together, so plans stay under their Spaces", () => {
		const pixel = { x: 300, y: 120 };
		const onPlan = toPlane(tilted, pixel);

		const scaled = scalePlacement(tilted, 2.5);
		const [moved] = scalePolygon([onPlan], 2.5);

		close(toPlane(scaled, pixel), moved as { x: number; y: number });
	});
});
