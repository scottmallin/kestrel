import type { Placement } from "@kestrel/geometry";
import { describe, expect, it } from "vitest";
import {
	applyOperation,
	type Draft,
	emptyDraft,
	type Operation,
} from "./draft.ts";
import type { Space } from "./index.ts";
import { parseOperation } from "./parse.ts";

const plan: Placement = { scale: 0.05, rotation: 0, x: 0, y: 0 };
const aligned: Placement = { scale: 0.04, rotation: 0.3, x: 2, y: -1 };

const unit = (id: string, levelId: string, size = 10): Space => ({
	id,
	levelId,
	kind: "unit",
	outline: [
		{ x: 0, y: 0 },
		{ x: size, y: 0 },
		{ x: size, y: size },
	],
});

function applyOk(draft: Draft, operation: Operation) {
	const result = applyOperation(draft, operation);
	if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
	return result;
}

const run = (draft: Draft, ...operations: Operation[]) =>
	operations.reduce((d, o) => applyOk(d, o).draft, draft);

/** Ground and first floors with a unit each; only the ground floor's plan is placed. */
const building = () =>
	run(
		emptyDraft(),
		{ type: "addLevel", level: { id: "g", name: "Ground floor", ordinal: 0 } },
		{ type: "addLevel", level: { id: "f1", name: "First floor", ordinal: 1 } },
		{ type: "addSpace", space: unit("a", "g") },
		{ type: "addSpace", space: unit("b", "f1") },
		{ type: "placeUnderlay", levelId: "g", placement: plan },
	);

describe("placeUnderlay", () => {
	it("places a Level's plan, and its inverse puts the old Placement back", () => {
		const before = building();
		const placed = applyOk(before, {
			type: "placeUnderlay",
			levelId: "f1",
			placement: aligned,
		});

		expect(placed.draft.placements).toEqual({ g: plan, f1: aligned });
		expect(applyOk(placed.draft, placed.inverse).draft).toEqual(before);
	});

	it("clears a Placement with null", () => {
		const cleared = run(building(), {
			type: "placeUnderlay",
			levelId: "g",
			placement: null,
		});
		expect(cleared.placements).toEqual({});
	});

	it("rejects an unknown Level or a scale that isn't positive", () => {
		expect(
			applyOperation(building(), {
				type: "placeUnderlay",
				levelId: "nope",
				placement: plan,
			}),
		).toEqual({ ok: false, error: "No Level with id nope" });
		expect(
			applyOperation(building(), {
				type: "placeUnderlay",
				levelId: "g",
				placement: { ...plan, scale: 0 },
			}),
		).toEqual({ ok: false, error: "A Placement's scale must be above 0" });
	});
});

describe("rescaleBuilding", () => {
	it("changes Spaces and Placements in one step, and its inverse restores them all", () => {
		const before = building();
		const rescaled = applyOk(before, {
			type: "rescaleBuilding",
			spaces: [unit("a", "g", 25), unit("b", "f1", 25)],
			placements: { g: { ...plan, scale: 0.125 } },
		});

		expect(rescaled.draft.spaces.a).toEqual(unit("a", "g", 25));
		expect(rescaled.draft.spaces.b).toEqual(unit("b", "f1", 25));
		expect(rescaled.draft.placements.g?.scale).toBe(0.125);
		expect(applyOk(rescaled.draft, rescaled.inverse).draft).toEqual(before);
	});

	it("rejects a Space that doesn't exist or moves Level, or a Placement for no Level", () => {
		const draft = building();
		const errors = [
			{ spaces: [unit("ghost", "g")], placements: {} },
			{ spaces: [unit("a", "f1")], placements: {} },
			{ spaces: [], placements: { nope: plan } },
		].map((change) =>
			applyOperation(draft, { type: "rescaleBuilding", ...change }),
		);

		expect(errors).toEqual([
			{ ok: false, error: "No Space with id ghost" },
			{ ok: false, error: "Space a can't change Level while rescaling" },
			{ ok: false, error: "No Level with id nope" },
		]);
	});
});

describe("rescaleBuilding and unplaced plans", () => {
	it("can place a plan that had no Placement, and undo takes it away again", () => {
		const before = building();
		const rescaled = applyOk(before, {
			type: "rescaleBuilding",
			spaces: [],
			placements: { f1: { ...plan, scale: 0.1 } },
		});

		expect(rescaled.draft.placements.f1?.scale).toBe(0.1);
		expect(applyOk(rescaled.draft, rescaled.inverse).draft).toEqual(before);
	});
});

describe("Placements scaled but not aligned yet", () => {
	it("are marked until the plan is aligned, and undo restores the mark", () => {
		const before = building();
		const scaled = applyOk(before, {
			type: "placeUnderlay",
			levelId: "f1",
			placement: { ...plan, scale: 0.08 },
			aligned: false,
		});
		expect(scaled.draft.unaligned).toEqual({ f1: true });

		const placed = applyOk(scaled.draft, {
			type: "placeUnderlay",
			levelId: "f1",
			placement: aligned,
		});
		expect(placed.draft.unaligned).toEqual({});
		expect(applyOk(placed.draft, placed.inverse).draft).toEqual(scaled.draft);
		expect(applyOk(scaled.draft, scaled.inverse).draft).toEqual(before);
	});

	it("removing a Level takes the mark with it, and undo brings it back", () => {
		const scaled = run(building(), {
			type: "placeUnderlay",
			levelId: "f1",
			placement: plan,
			aligned: false,
		});
		const removed = applyOk(scaled, { type: "removeLevel", id: "f1" });
		expect(removed.draft.unaligned).toEqual({});
		expect(applyOk(removed.draft, removed.inverse).draft).toEqual(scaled);
	});
});

describe("Placements and Levels", () => {
	it("removing a Level removes its Placement, and undo brings it back", () => {
		const before = building();
		const removed = applyOk(before, { type: "removeLevel", id: "g" });

		expect(removed.draft.placements).toEqual({});
		expect(applyOk(removed.draft, removed.inverse).draft).toEqual(before);
	});
});

describe("parseOperation for Placements", () => {
	it("accepts well-formed Placement Operations", () => {
		const operations: Operation[] = [
			{ type: "placeUnderlay", levelId: "g", placement: aligned },
			{ type: "placeUnderlay", levelId: "g", placement: null },
			{ type: "placeUnderlay", levelId: "g", placement: plan, aligned: false },
			{
				type: "rescaleBuilding",
				spaces: [unit("a", "g")],
				placements: { g: plan },
			},
		];
		for (const operation of operations)
			expect(parseOperation(operation)).toEqual({ ok: true, value: operation });
	});

	it("rejects Placements with missing, non-numeric or infinite parts", () => {
		const bad = [
			{ type: "placeUnderlay", levelId: "g", placement: { scale: 1 } },
			{ type: "placeUnderlay", levelId: "g", placement: { ...plan, x: "0" } },
			{
				type: "placeUnderlay",
				levelId: "g",
				placement: { ...plan, y: Number.POSITIVE_INFINITY },
			},
			{ type: "rescaleBuilding", spaces: "all", placements: {} },
		];
		expect(bad.map((o) => parseOperation(o).ok)).toEqual([
			false,
			false,
			false,
			false,
		]);
	});
});
