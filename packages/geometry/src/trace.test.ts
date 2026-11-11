import { describe, expect, it } from "vitest";
import {
	LEAKED,
	suggestWallDarkness,
	traceRoom,
	type WallMask,
} from "./trace.ts";

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

	it("steps off a label or number to fill the room around it", () => {
		const p = plan(100, 80);
		p.room(10, 10, 60, 50);
		p.wall(28, 28, 33, 32); // a number badge

		const result = traceRoom(p.mask, { x: 30, y: 30 });

		expect(result.ok && result.outline).toContainEqual({ x: 59, y: 49 });
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
				reason: LEAKED,
			});
		});

		it("takes a narrow room as drawn when closing doorways would fill it", () => {
			// A room 8px wide inside, with a 2px label across it: a door gap of 8 swells the walls and label
			// until nothing is left to fill, so the room is filled as drawn.
			const p = plan(100, 80);
			p.room(10, 10, 21, 50);
			p.wall(13, 30, 18, 31);

			const result = traceRoom(p.mask, { x: 15, y: 20 }, { doorGap: 8 });

			expect(result.ok && result.outline).toContainEqual({ x: 12, y: 12 });
			expect(result.ok && result.outline).toContainEqual({ x: 20, y: 49 });
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

	it("tidies rough, scanned-looking walls into a clean rectangle", () => {
		const p = plan(100, 80);
		p.room(10, 10, 60, 50);
		// Single-pixel specks along the inside of the right and bottom walls.
		for (let y = 15; y < 48; y += 5) p.wall(58, y, 58, y);
		for (let x = 15; x < 58; x += 7) p.wall(x, 48, x, 48);

		const result = traceRoom(p.mask, { x: 30, y: 30 });

		expect(result.ok && result.outline).toHaveLength(4);
		for (const ideal of [
			{ x: 12, y: 12 },
			{ x: 59, y: 12 },
			{ x: 59, y: 49 },
			{ x: 12, y: 49 },
		]) {
			const nearest = result.ok
				? Math.min(
						...result.outline.map((c) =>
							Math.hypot(c.x - ideal.x, c.y - ideal.y),
						),
					)
				: Infinity;
			expect(nearest).toBeLessThanOrEqual(1);
		}
	});

	it("treats Spaces already drawn as walls", () => {
		const p = plan(100, 80);
		p.room(10, 10, 60, 50);
		const leftHalf = [
			{ x: 12, y: 12 },
			{ x: 36, y: 12 },
			{ x: 36, y: 49 },
			{ x: 12, y: 49 },
		];

		const result = traceRoom(
			p.mask,
			{ x: 50, y: 30 },
			{ occupied: [leftHalf] },
		);

		expect(
			result.ok && [...result.outline].sort((a, b) => a.x - b.x || a.y - b.y),
		).toEqual([
			{ x: 36, y: 12 },
			{ x: 36, y: 49 },
			{ x: 59, y: 12 },
			{ x: 59, y: 49 },
		]);
	});

	it("says so when the click is inside a Space already drawn", () => {
		const p = plan(100, 80);
		p.room(10, 10, 60, 50);
		const whole = [
			{ x: 12, y: 12 },
			{ x: 59, y: 12 },
			{ x: 59, y: 49 },
			{ x: 12, y: 49 },
		];
		expect(traceRoom(p.mask, { x: 30, y: 30 }, { occupied: [whole] })).toEqual({
			ok: false,
			reason: "That spot is already part of a Space.",
		});
	});
});

describe("suggestWallDarkness", () => {
	/** A histogram from { luminance: share of pixels }. */
	const histogram = (shares: Record<number, number>) => {
		const h = new Array<number>(256).fill(0);
		for (const [l, share] of Object.entries(shares))
			h[Number(l)] = share * 10_000;
		return h;
	};

	it("counts a poster's pale-grey walls, but not its paper or corridor fill", () => {
		// White paper, light-grey corridors, grey walls (~175), dark number badges.
		const darkness = suggestWallDarkness(
			histogram({ 255: 0.6, 237: 0.3, 175: 0.05, 80: 0.05 }),
		);
		expect(darkness).toBeGreaterThan(175);
		expect(darkness).toBeLessThan(237);
	});

	it("counts black walls on white paper", () => {
		const darkness = suggestWallDarkness(histogram({ 255: 0.96, 17: 0.04 }));
		expect(darkness).toBeGreaterThan(17);
		expect(darkness).toBeLessThan(255);
	});

	it("falls back to a middling darkness when there's no light paper", () => {
		expect(suggestWallDarkness(histogram({ 20: 0.9, 230: 0.04 }))).toBe(110);
	});
});
