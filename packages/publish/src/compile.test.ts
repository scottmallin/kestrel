import type { Draft, Listing, Space } from "@kestrel/domain";
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
const draftOf = (...spaces: Space[]): Draft => withListings(spaces);
const withListings = (spaces: Space[], ...listings: Listing[]): Draft => ({
	spaces: Object.fromEntries(spaces.map((s) => [s.id, s])),
	listings: Object.fromEntries(listings.map((l) => [l.id, l])),
});

const compile = (draft: Draft) =>
	compileBundle({
		map: { id: "M1", name: "Main mall" },
		levels: [level],
		categories: [{ id: "health", name: "Health & beauty" }],
		logoUrl: (key) => `https://cdn.example/${key}`,
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
			label: "Unit 1",
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

	describe("Listings", () => {
		const boots: Listing = {
			id: "boots",
			name: "Boots",
			categoryId: "health",
			spaceIds: ["a", "gone"],
			logoKey: "logos/boots.png",
		};
		const zara: Listing = {
			id: "zara",
			name: "Zara",
			spaceIds: ["b"],
			website: "https://zara.com",
		};
		const unplaced: Listing = { id: "hmv", name: "HMV", spaceIds: ["gone"] };
		const spaces = [
			unit("a", 0, "Unit 1"),
			unit("b", 10, "Unit 2"),
			unit("c", 20, "Unit 3"),
		];

		it("publishes placed Listings with their Category and logo, keeping only Spaces that exist", () => {
			const bundle = compile(withListings(spaces, boots, zara, unplaced));

			expect(bundle.listings).toEqual([
				{
					id: "boots",
					name: "Boots",
					categoryId: "health",
					spaceIds: ["a"],
					logoUrl: "https://cdn.example/logos/boots.png",
				},
				{
					id: "zara",
					name: "Zara",
					spaceIds: ["b"],
					website: "https://zara.com",
				},
			]);
			expect(bundle.categories).toEqual([
				{ id: "health", name: "Health & beauty" },
			]);
		});

		it("lists Listings and facilities in the directory; vacant units drop out", () => {
			const toilets: Space = { ...unit("t", 30), kind: "toilet" };
			const lift: Space = { ...unit("l", 40, "Lift A"), kind: "lift" };
			const bundle = compile(
				withListings([...spaces, toilets, lift], boots, zara, unplaced),
			);

			expect(bundle.directory).toEqual([
				{
					id: "boots",
					label: "Boots",
					detail: "Health & beauty",
					categoryId: "health",
					spaceIds: ["a"],
				},
				{
					id: "l",
					label: "Lift A",
					detail: "Lift",
					categoryId: null,
					spaceIds: ["l"],
				},
				{
					id: "t",
					label: "Toilets",
					detail: "",
					categoryId: null,
					spaceIds: ["t"],
				},
				{
					id: "zara",
					label: "Zara",
					detail: "",
					categoryId: null,
					spaceIds: ["b"],
				},
			]);
		});

		it("treats a Category that no longer exists as none", () => {
			const bundle = compile(
				withListings(spaces, { ...zara, categoryId: "deleted" }),
			);
			expect(bundle.listings[0]).not.toHaveProperty("categoryId");
			expect(bundle.directory[0]).toMatchObject({
				detail: "",
				categoryId: null,
			});
		});

		it("labels a Space on the map with its Listing's name, else its Space Reference", () => {
			const bundle = compile(withListings(spaces, boots, zara));
			expect(bundle.spaces.features.map((f) => f.properties.label)).toEqual([
				"Boots",
				"Zara",
				"Unit 3",
			]);
		});
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
