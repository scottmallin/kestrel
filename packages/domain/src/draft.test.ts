import { describe, expect, it } from "vitest";
import {
	applyOperation,
	type Draft,
	emptyDraft,
	type Operation,
} from "./draft.ts";
import type { Space } from "./index.ts";

const unit1: Space = {
	id: "s1",
	levelId: "l1",
	kind: "unit",
	reference: "Unit 1",
	outline: [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 8 },
		{ x: 0, y: 8 },
	],
};

function applyOk(draft: Draft, operation: Operation) {
	const result = applyOperation(draft, operation);
	if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
	return result;
}

describe("addSpace", () => {
	it("adds the Space to the Draft", () => {
		const { draft } = applyOk(emptyDraft(), { type: "addSpace", space: unit1 });
		expect(draft.spaces).toEqual({ s1: unit1 });
	});
});

describe("inverse", () => {
	it("of removeSpaces restores every removed Space", () => {
		const original = draftWith(unit1, unit2());
		const removed = applyOk(original, {
			type: "removeSpaces",
			ids: ["s1", "s2"],
		});
		expect(removed.draft.spaces).toEqual({});
		expect(applyOk(removed.draft, removed.inverse).draft).toEqual(original);
	});

	it("of addSpace restores the original Draft", () => {
		const original = applyOk(emptyDraft(), {
			type: "addSpace",
			space: unit2(),
		}).draft;
		const added = applyOk(original, { type: "addSpace", space: unit1 });
		expect(applyOk(added.draft, added.inverse).draft).toEqual(original);
	});
});

function unit2(): Space {
	return {
		...unit1,
		id: "s2",
		reference: "Unit 2",
		outline: unit1.outline.map((p) => ({ x: p.x + 10, y: p.y })),
	};
}

function draftWith(...spaces: Space[]): Draft {
	return {
		spaces: Object.fromEntries(spaces.map((s) => [s.id, s])),
		listings: {},
	};
}

describe("replaceSpaces", () => {
	it("splits one Space into two, and its inverse puts the original back", () => {
		const left: Space = { ...unit1, id: "s1a", outline: rect(0, 0, 5, 8) };
		const right: Space = { ...unit1, id: "s1b", outline: rect(5, 0, 10, 8) };
		const original = draftWith(unit1);

		const split = applyOk(original, {
			type: "replaceSpaces",
			remove: ["s1"],
			add: [left, right],
		});

		expect(split.draft.spaces).toEqual({ s1a: left, s1b: right });
		expect(applyOk(split.draft, split.inverse).draft).toEqual(original);
	});
});

function rect(x0: number, y0: number, x1: number, y1: number) {
	return [
		{ x: x0, y: y0 },
		{ x: x1, y: y0 },
		{ x: x1, y: y1 },
		{ x: x0, y: y1 },
	];
}

describe("rejects", () => {
	it("a Space outline with fewer than 3 corners", () => {
		const line = { ...unit1, outline: unit1.outline.slice(0, 2) };
		const result = applyOperation(emptyDraft(), {
			type: "addSpace",
			space: line,
		});
		expect(result).toEqual({
			ok: false,
			error: "Space s1 needs at least 3 corners",
		});
	});

	it("adding a Space whose id is already taken", () => {
		const result = applyOperation(draftWith(unit1), {
			type: "addSpace",
			space: unit1,
		});
		expect(result).toEqual({
			ok: false,
			error: "A Space with id s1 already exists",
		});
	});

	it("removing a Space that isn't in the Draft", () => {
		const result = applyOperation(draftWith(unit1), {
			type: "removeSpaces",
			ids: ["s1", "nope"],
		});
		expect(result).toEqual({ ok: false, error: "No Space with id nope" });
	});
});

describe("reshapeSpace", () => {
	it("changes a Space's outline, and its inverse restores the old one", () => {
		const original = draftWith(unit1);
		const wider = rect(0, 0, 12, 8);

		const reshaped = applyOk(original, {
			type: "reshapeSpace",
			id: "s1",
			outline: wider,
		});

		expect(reshaped.draft.spaces.s1).toEqual({ ...unit1, outline: wider });
		expect(applyOk(reshaped.draft, reshaped.inverse).draft).toEqual(original);
	});
});

describe("updateSpace", () => {
	it("changes Space Kind and Space Reference, and its inverse restores them", () => {
		const corridor: Space = {
			id: "c1",
			levelId: "l1",
			kind: "corridor",
			outline: rect(0, 8, 20, 10),
		};
		const original = draftWith(corridor);

		const updated = applyOk(original, {
			type: "updateSpace",
			id: "c1",
			changes: { kind: "toilet", reference: "WC1" },
		});

		expect(updated.draft.spaces.c1).toEqual({
			...corridor,
			kind: "toilet",
			reference: "WC1",
		});
		expect(applyOk(updated.draft, updated.inverse).draft).toEqual(original);
	});

	it("clears a Space Reference with null", () => {
		const updated = applyOk(draftWith(unit1), {
			type: "updateSpace",
			id: "s1",
			changes: { reference: null },
		});
		expect(updated.draft.spaces.s1).not.toHaveProperty("reference");
		expect(applyOk(updated.draft, updated.inverse).draft).toEqual(
			draftWith(unit1),
		);
	});
});
