import {
	containsPoint,
	type Placement,
	polygonArea,
	toPlane,
	type WallMask,
} from "@kestrel/geometry";
import { describe, expect, it } from "vitest";
import { traceOnPlan } from "./underlay.ts";

/** A 200 × 200 px plan with one square room, walls along 50 and 150 px. */
function roomMask(): WallMask {
	const size = 200;
	const walls = new Uint8Array(size * size);
	for (let i = 50; i <= 150; i++) {
		for (const [x, y] of [
			[i, 50],
			[i, 150],
			[50, i],
			[150, i],
		] as const)
			walls[y * size + x] = 1;
	}
	return { width: size, height: size, walls };
}

/** Turned a quarter, 10 cm per pixel, and moved away from the origin. */
const placement: Placement = {
	scale: 0.1,
	rotation: Math.PI / 2,
	x: 100,
	y: 20,
};

describe("Magic fill on a placed plan", () => {
	it("fills the room where you clicked on the plane, at the plan's scale", () => {
		const click = toPlane(placement, { x: 100, y: 100 });
		const result = traceOnPlan(roomMask(), placement, click, { doorGap: 0 });
		if (!result.ok) throw new Error(result.reason);

		expect(containsPoint(result.outline, click)).toBe(true);
		// About 100 px square at 0.1 m per pixel: roughly 100 m².
		expect(polygonArea(result.outline)).toBeGreaterThan(95);
		expect(polygonArea(result.outline)).toBeLessThan(101);
	});

	it("treats Spaces already drawn (on the plane) as filled", () => {
		const click = toPlane(placement, { x: 100, y: 100 });
		const around = [
			toPlane(placement, { x: 60, y: 60 }),
			toPlane(placement, { x: 140, y: 60 }),
			toPlane(placement, { x: 140, y: 140 }),
			toPlane(placement, { x: 60, y: 140 }),
		];
		const result = traceOnPlan(roomMask(), placement, click, {
			occupied: [around],
		});
		expect(result).toEqual({
			ok: false,
			reason: "That spot is already part of a Space.",
		});
	});
});
