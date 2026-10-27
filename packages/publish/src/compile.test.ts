import type { Draft, Space } from "@kestrel/domain";
import { describe, expect, it } from "vitest";
import { compileBundle, METRES_PER_DEGREE } from "./compile.ts";

const level = { id: "L0", name: "Ground floor", ordinal: 0 };
const unit = (id: string, x: number, reference?: string): Space => ({
	id,
	levelId: "L0",
	kind: "unit",
	...(reference && { reference }),
	outline: [
		{ x, y: 0 },
		{ x: x + 10, y: 0 },
		{ x: x + 10, y: 8 },
		{ x, y: 8 },
	],
});
const draftOf = (...spaces: Space[]): Draft => ({
	spaces: Object.fromEntries(spaces.map((s) => [s.id, s])),
});

const compile = (draft: Draft) =>
	compileBundle({
		map: { id: "M1", name: "Main mall" },
		levels: [level],
		draft,
		version: 3,
		publishedAt: "2026-10-27T12:00:00.000Z",
	});

/** Degrees for a distance in metres at 0°, 0°. */
const deg = (metres: number) => metres / METRES_PER_DEGREE;

describe("compileBundle", () => {
	it("turns each Space into a map feature placed by its metres, north up", () => {
		const bundle = compile(draftOf(unit("a", 0, "Unit 1")));

		expect(bundle.spaces.features).toHaveLength(1);
		const [feature] = bundle.spaces.features;
		expect(feature?.properties).toEqual({
			id: "a",
			levelId: "L0",
			kind: "unit",
			reference: "Unit 1",
			area: 80,
		});
		const ring = feature?.geometry.coordinates[0] ?? [];
		// Closed ring; y grows southwards in the editor, so it becomes negative latitude.
		expect(ring).toHaveLength(5);
		expect(ring[0]).toEqual(ring[4]);
		for (const [lng, lat] of [
			[0, 0],
			[deg(10), 0],
			[deg(10), -deg(8)],
			[0, -deg(8)],
		] as const) {
			expect(
				ring.some(
					([x, y]) =>
						Math.abs((x ?? 0) - lng) < 1e-9 && Math.abs((y ?? 0) - lat) < 1e-9,
				),
			).toBe(true);
		}
	});

	it("lists referenced Spaces in the directory, in natural order", () => {
		const corridor: Space = { ...unit("c", 40), kind: "corridor" };
		const bundle = compile(
			draftOf(
				unit("a", 0, "Unit 10"),
				unit("b", 10, "Unit 2"),
				corridor,
				unit("d", 20, "Toilets"),
			),
		);

		expect(bundle.directory).toEqual([
			{ spaceId: "d", levelId: "L0", label: "Toilets", kind: "unit" },
			{ spaceId: "b", levelId: "L0", label: "Unit 2", kind: "unit" },
			{ spaceId: "a", levelId: "L0", label: "Unit 10", kind: "unit" },
		]);
	});

	it("records the bounds of everything drawn, so the Embed can fit it", () => {
		const bundle = compile(draftOf(unit("a", 0), unit("b", 30)));
		expect(bundle.bounds).toEqual([0, -deg(8), deg(40), 0]);
	});

	it("has no bounds when nothing is drawn", () => {
		expect(compile(draftOf()).bounds).toBeNull();
	});

	it("gives the same bundle whatever order the Spaces were drawn in", () => {
		expect(compile(draftOf(unit("a", 0, "A"), unit("b", 10, "B")))).toEqual(
			compile(draftOf(unit("b", 10, "B"), unit("a", 0, "A"))),
		);
	});

	it("winds every outline anticlockwise, as GeoJSON requires, however it was drawn", () => {
		const clockwise = unit("a", 0);
		const anticlockwise = {
			...unit("b", 20),
			outline: [...unit("b", 20).outline].reverse(),
		};
		for (const feature of compile(draftOf(clockwise, anticlockwise)).spaces
			.features) {
			const ring = feature.geometry.coordinates[0] ?? [];
			let twiceSignedArea = 0;
			for (let i = 0; i < ring.length - 1; i++) {
				const [x1 = 0, y1 = 0] = ring[i] ?? [];
				const [x2 = 0, y2 = 0] = ring[i + 1] ?? [];
				twiceSignedArea += x1 * y2 - x2 * y1;
			}
			expect(twiceSignedArea, feature.properties.id).toBeGreaterThan(0);
		}
	});
});
