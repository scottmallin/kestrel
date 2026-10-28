import { describe, expect, it } from "vitest";
import {
	applyOperation,
	type Draft,
	emptyDraft,
	type Operation,
} from "./draft.ts";
import type { Listing, Space } from "./index.ts";

const unit: Space = {
	id: "s1",
	levelId: "l1",
	kind: "unit",
	outline: [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 8 },
	],
};
const boots: Listing = {
	id: "boots",
	name: "Boots",
	categoryId: "health",
	spaceIds: ["s1"],
};

function applyOk(draft: Draft, operation: Operation) {
	const result = applyOperation(draft, operation);
	if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
	return result;
}

const withUnit = () =>
	applyOk(emptyDraft(), { type: "addSpace", space: unit }).draft;

describe("addListing", () => {
	it("adds a Listing, and its inverse removes it again", () => {
		const before = withUnit();
		const added = applyOk(before, { type: "addListing", listing: boots });

		expect(added.draft.listings).toEqual({ boots });
		expect(applyOk(added.draft, added.inverse).draft).toEqual(before);
	});

	it("rejects a Listing id that's already taken, or a blank name", () => {
		const draft = applyOk(withUnit(), {
			type: "addListing",
			listing: boots,
		}).draft;
		expect(
			applyOperation(draft, { type: "addListing", listing: boots }),
		).toEqual({
			ok: false,
			error: "A Listing with id boots already exists",
		});
		expect(
			applyOperation(withUnit(), {
				type: "addListing",
				listing: { ...boots, name: "  " },
			}),
		).toEqual({
			ok: false,
			error: "Listing boots needs a name",
		});
	});
});

describe("updateListing", () => {
	it("changes details and placement, clears fields with null, and its inverse restores them", () => {
		const before = applyOk(withUnit(), {
			type: "addListing",
			listing: { ...boots, website: "https://boots.com", hours: "9–5" },
		}).draft;

		const updated = applyOk(before, {
			type: "updateListing",
			id: "boots",
			changes: {
				name: "Boots Pharmacy",
				website: null,
				spaceIds: ["s1", "s2"],
				logoKey: "logos/boots.png",
			},
		});

		expect(updated.draft.listings.boots).toEqual({
			id: "boots",
			name: "Boots Pharmacy",
			categoryId: "health",
			spaceIds: ["s1", "s2"],
			logoKey: "logos/boots.png",
			hours: "9–5",
		});
		expect(applyOk(updated.draft, updated.inverse).draft).toEqual(before);
	});

	it("rejects an unknown Listing or a blank name", () => {
		const draft = applyOk(withUnit(), {
			type: "addListing",
			listing: boots,
		}).draft;
		expect(
			applyOperation(draft, {
				type: "updateListing",
				id: "nope",
				changes: { name: "X" },
			}),
		).toEqual({
			ok: false,
			error: "No Listing with id nope",
		});
		expect(
			applyOperation(draft, {
				type: "updateListing",
				id: "boots",
				changes: { name: "" },
			}),
		).toEqual({
			ok: false,
			error: "Listing boots needs a name",
		});
	});
});

describe("Spaces and Listings", () => {
	it("deleting a Space leaves its Listing alone, and undoing the delete restores the placement", () => {
		const placed = applyOk(withUnit(), {
			type: "addListing",
			listing: boots,
		}).draft;

		const removed = applyOk(placed, { type: "removeSpaces", ids: ["s1"] });
		expect(removed.draft.listings.boots).toEqual(boots);

		expect(applyOk(removed.draft, removed.inverse).draft).toEqual(placed);
	});
});
