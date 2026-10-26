import { describe, expect, it } from "vitest";
import { traceRoom, type WallMask } from "./trace.ts";

/** A blank plan with helpers to draw walls (1 = wall) and knock doors through them. */
function plan(width: number, height: number) {
	const walls = new Uint8Array(width * height);
	const fill = (
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		value: 0 | 1,
	) => {
		for (let y = y0; y <= y1; y++)
			for (let x = x0; x <= x1; x++) walls[y * width + x] = value;
	};
	return {
		mask: { width, height, walls } satisfies WallMask,
		/** A room outline with 2px walls; the inside runs from x0+2,y0+2 to x1-2,y1-2. */
		room(x0: number, y0: number, x1: number, y1: number) {
			fill(x0, y0, x1, y0 + 1, 1);
			fill(x0, y1 - 1, x1, y1, 1);
			fill(x0, y0, x0 + 1, y1, 1);
			fill(x1 - 1, y0, x1, y1, 1);
		},
		gap: (x0: number, y0: number, x1: number, y1: number) =>
			fill(x0, y0, x1, y1, 0),
		wall: (x0: number, y0: number, x1: number, y1: number) =>
			fill(x0, y0, x1, y1, 1),
	};
}

describe("traceRoom", () => {
	it("traces a closed rectangular room as its 4 inside corners", () => {
		const p = plan(100, 80);
		p.room(10, 10, 60, 50);

		const result = traceRoom(p.mask, { x: 30, y: 30 });

		expect(result).toEqual({
			ok: true,
			outline: expect.arrayContaining([
				{ x: 12, y: 12 },
				{ x: 59, y: 12 },
				{ x: 59, y: 49 },
				{ x: 12, y: 49 },
			]),
		});
		expect(result.ok && result.outline).toHaveLength(4);
	});

	it("rejects a click on a wall", () => {
		const p = plan(100, 80);
		p.room(10, 10, 60, 50);
		expect(traceRoom(p.mask, { x: 10.5, y: 30 })).toEqual({
			ok: false,
			reason: "That spot is on a wall. Click further inside the room.",
		});
	});

	it("rejects a click outside the plan", () => {
		const p = plan(100, 80);
		expect(traceRoom(p.mask, { x: -5, y: 30 })).toEqual({
			ok: false,
			reason: "Click inside the plan.",
		});
	});

	describe("doorways", () => {
		// A room whose right wall has a 6px doorway onto the open floor around it.
		const withDoor = () => {
			const p = plan(100, 80);
			p.room(10, 10, 60, 50);
			p.gap(59, 27, 60, 32);
			return p;
		};

		it("reports a leak when the fill escapes through a doorway", () => {
			expect(traceRoom(withDoor().mask, { x: 30, y: 30 })).toEqual({
				ok: false,
				reason:
					"The fill leaked out of the room. Raise the door gap, or close the opening.",
			});
		});

		it("closes doorways no wider than the door gap", () => {
			const result = traceRoom(
				withDoor().mask,
				{ x: 30, y: 30 },
				{ doorGap: 8 },
			);
			expect(
				result.ok && [...result.outline].sort((a, b) => a.x - b.x || a.y - b.y),
			).toEqual([
				{ x: 12, y: 12 },
				{ x: 12, y: 49 },
				{ x: 59, y: 12 },
				{ x: 59, y: 49 },
			]);
		});

		it("still finds the room when the click is close to a wall", () => {
			const result = traceRoom(
				withDoor().mask,
				{ x: 13, y: 30 },
				{ doorGap: 8 },
			);
			expect(result.ok && result.outline).toHaveLength(4);
			expect(result.ok && result.outline).toContainEqual({ x: 59, y: 49 });
		});
	});
});
