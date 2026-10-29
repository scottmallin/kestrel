import { describe, expect, it } from "vitest";
import {
	applyOperation,
	type Draft,
	emptyDraft,
	type Operation,
} from "./draft.ts";
import { createHistory, perform, undo } from "./history.ts";
import type { Level, Listing, Space } from "./index.ts";
import { parseOperation } from "./parse.ts";

const ground: Level = { id: "g", name: "Ground floor", ordinal: 0 };
const first: Level = { id: "f1", name: "First floor", ordinal: 1 };
const basement: Level = { id: "b1", name: "Basement", ordinal: -1 };

const spaceOn = (id: string, levelId: string): Space => ({
	id,
	levelId,
	kind: "unit",
	outline: [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 8 },
	],
});

function applyOk(draft: Draft, operation: Operation) {
	const result = applyOperation(draft, operation);
	if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
	return result;
}

const run = (draft: Draft, ...operations: Operation[]) =>
	operations.reduce((d, o) => applyOk(d, o).draft, draft);

/** Ground and first floors, with one unit on each. */
const twoLevels = () =>
	run(
		emptyDraft(),
		{ type: "addLevel", level: ground },
		{ type: "addLevel", level: first },
		{ type: "addSpace", space: spaceOn("s-g", "g") },
		{ type: "addSpace", space: spaceOn("s-f1", "f1") },
	);

describe("addLevel", () => {
	it("adds a Level, and its inverse removes it again", () => {
		const before = run(emptyDraft(), { type: "addLevel", level: ground });
		const added = applyOk(before, { type: "addLevel", level: first });

		expect(added.draft.levels).toEqual({ g: ground, f1: first });
		expect(applyOk(added.draft, added.inverse).draft).toEqual(before);
	});

	it("allows basements below the ground floor", () => {
		const draft = run(twoLevels(), { type: "addLevel", level: basement });
		expect(draft.levels.b1).toEqual(basement);
	});

	it("rejects a taken id, a taken ordinal, a blank name or a fractional ordinal", () => {
		const draft = twoLevels();
		const errors = [
			{ ...basement, id: "g" },
			{ ...basement, ordinal: 1 },
			{ ...basement, name: "  " },
			{ ...basement, ordinal: 0.5 },
		].map((level) => applyOperation(draft, { type: "addLevel", level }));

		expect(errors).toEqual([
			{ ok: false, error: "A Level with id g already exists" },
			{ ok: false, error: "First floor is already Level 1" },
			{ ok: false, error: "Level b1 needs a name" },
			{ ok: false, error: "Level b1 needs a whole-number ordinal" },
		]);
	});

	it("can bring Spaces back with the Level", () => {
		const draft = run(emptyDraft(), {
			type: "addLevel",
			level: ground,
			spaces: [spaceOn("s1", "g")],
		});
		expect(Object.keys(draft.spaces)).toEqual(["s1"]);
	});

	it("rejects Spaces that belong to another Level", () => {
		const result = applyOperation(twoLevels(), {
			type: "addLevel",
			level: basement,
			spaces: [spaceOn("s1", "g")],
		});
		expect(result).toEqual({
			ok: false,
			error: "Space s1 is not on Level b1",
		});
	});
});

describe("updateLevel", () => {
	it("renames a Level, and its inverse restores the old name", () => {
		const before = twoLevels();
		const renamed = applyOk(before, {
			type: "updateLevel",
			id: "g",
			changes: { name: "Lower mall" },
		});

		expect(renamed.draft.levels.g?.name).toBe("Lower mall");
		expect(applyOk(renamed.draft, renamed.inverse).draft).toEqual(before);
	});

	it("rejects an unknown Level or a blank name", () => {
		expect(
			applyOperation(twoLevels(), {
				type: "updateLevel",
				id: "nope",
				changes: { name: "X" },
			}),
		).toEqual({ ok: false, error: "No Level with id nope" });
		expect(
			applyOperation(twoLevels(), {
				type: "updateLevel",
				id: "g",
				changes: { name: "" },
			}),
		).toEqual({ ok: false, error: "Level g needs a name" });
	});
});

describe("reorderLevels", () => {
	it("swaps two Levels in one step, and its inverse swaps them back", () => {
		const before = twoLevels();
		const swapped = applyOk(before, {
			type: "reorderLevels",
			ordinals: { g: 1, f1: 0 },
		});

		expect(swapped.draft.levels.g?.ordinal).toBe(1);
		expect(swapped.draft.levels.f1?.ordinal).toBe(0);
		expect(applyOk(swapped.draft, swapped.inverse).draft).toEqual(before);
	});

	it("rejects an unknown Level, a clash or a fractional ordinal", () => {
		const draft = twoLevels();
		const errors = [{ nope: 3 }, { g: 1 }, { g: 0.5 }].map((ordinals) =>
			applyOperation(draft, { type: "reorderLevels", ordinals }),
		);

		expect(errors).toEqual([
			{ ok: false, error: "No Level with id nope" },
			{ ok: false, error: "First floor is already Level 1" },
			{ ok: false, error: "Level g needs a whole-number ordinal" },
		]);
	});
});

describe("removeLevel", () => {
	it("removes the Level and only its Spaces, and its inverse brings both back", () => {
		const before = twoLevels();
		const removed = applyOk(before, { type: "removeLevel", id: "f1" });

		expect(Object.keys(removed.draft.levels)).toEqual(["g"]);
		expect(Object.keys(removed.draft.spaces)).toEqual(["s-g"]);
		expect(applyOk(removed.draft, removed.inverse).draft).toEqual(before);
	});

	it("never removes the last Level, or one that doesn't exist", () => {
		const one = run(emptyDraft(), { type: "addLevel", level: ground });
		expect(applyOperation(one, { type: "removeLevel", id: "g" })).toEqual({
			ok: false,
			error: "A Map needs at least one Level",
		});
		expect(
			applyOperation(twoLevels(), { type: "removeLevel", id: "nope" }),
		).toEqual({ ok: false, error: "No Level with id nope" });
	});

	it("leaves Listings alone, and undo places them again", () => {
		const boots: Listing = { id: "boots", name: "Boots", spaceIds: ["s-f1"] };
		const draft = run(twoLevels(), { type: "addListing", listing: boots });
		const removed = perform(createHistory(draft), {
			type: "removeLevel",
			id: "f1",
		});
		if (!removed.ok) throw new Error(removed.error);

		expect(removed.history.draft.listings.boots).toEqual(boots);
		expect(removed.history.draft.spaces["s-f1"]).toBeUndefined();
		expect(undo(removed.history).draft).toEqual(draft);
	});
});

describe("Spaces and Levels", () => {
	it("rejects a Space on a Level that doesn't exist", () => {
		const draft = twoLevels();
		expect(
			applyOperation(draft, {
				type: "addSpace",
				space: spaceOn("s2", "nope"),
			}),
		).toEqual({
			ok: false,
			error: "Space s2 is on Level nope, which doesn't exist",
		});
		expect(
			applyOperation(draft, {
				type: "replaceSpaces",
				remove: ["s-g"],
				add: [spaceOn("s-g", "nope")],
			}),
		).toEqual({
			ok: false,
			error: "Space s-g is on Level nope, which doesn't exist",
		});
	});
});

describe("parseOperation for Levels", () => {
	it("accepts well-formed Level Operations", () => {
		const operations: Operation[] = [
			{ type: "addLevel", level: basement },
			{ type: "addLevel", level: ground, spaces: [spaceOn("s1", "g")] },
			{ type: "updateLevel", id: "g", changes: { name: "Lower mall" } },
			{ type: "reorderLevels", ordinals: { g: 1, f1: 0 } },
			{ type: "removeLevel", id: "f1" },
		];
		for (const operation of operations)
			expect(parseOperation(operation)).toEqual({ ok: true, value: operation });
	});

	it("rejects long names, fractional or far-flung ordinals, and bad Spaces", () => {
		const bad = [
			{ type: "addLevel", level: { ...ground, name: "x".repeat(61) } },
			{ type: "addLevel", level: { ...ground, ordinal: "0" } },
			{ type: "reorderLevels", ordinals: { g: 1.5 } },
			{ type: "reorderLevels", ordinals: { g: 1000 } },
			{ type: "addLevel", level: ground, spaces: [{ id: "s1" }] },
		];
		expect(bad.map((o) => parseOperation(o).ok)).toEqual([
			false,
			false,
			false,
			false,
			false,
		]);
	});
});
