import { describe, expect, it } from "vitest";
import {
	applyOperation,
	type Draft,
	emptyDraft,
	type Operation,
} from "./draft.ts";
import { levelSetup } from "./setup.ts";

function run(draft: Draft, ...operations: Operation[]) {
	return operations.reduce((d, o) => {
		const result = applyOperation(d, o);
		if (!result.ok) throw new Error(result.error);
		return result.draft;
	}, draft);
}

const twoLevels = () =>
	run(
		emptyDraft(),
		{ type: "addLevel", level: { id: "g", name: "Ground floor", ordinal: 0 } },
		{ type: "addLevel", level: { id: "f1", name: "First floor", ordinal: 1 } },
	);
const placement = { scale: 0.05, rotation: 0, x: 0, y: 0 };
/** What Set scale does on the ground floor's plan when it's the first. */
const setScaleOnGround: Operation = {
	type: "rescaleBuilding",
	spaces: [],
	placements: { g: placement },
	scaleSet: true,
};

describe("levelSetup", () => {
	it("lets you draw on a blank grid straight away", () => {
		expect(levelSetup(twoLevels(), "g", { hasPlan: false })).toBe("ready");
	});

	it("asks for the scale first, when a Level has a plan and the Building has no scale", () => {
		expect(levelSetup(twoLevels(), "g", { hasPlan: true })).toBe("setScale");
	});

	it("is ready once the plan is placed by setting the scale", () => {
		const draft = run(twoLevels(), setScaleOnGround);
		expect(levelSetup(draft, "g", { hasPlan: true })).toBe("ready");
	});

	it("asks every other plan for its own scale, then Alignment", () => {
		const draft = run(twoLevels(), setScaleOnGround);
		expect(levelSetup(draft, "f1", { hasPlan: false })).toBe("ready");
		expect(levelSetup(draft, "f1", { hasPlan: true })).toBe("setScale");

		const scaled = run(draft, {
			type: "placeUnderlay",
			levelId: "f1",
			placement: { ...placement, scale: 0.08 },
			aligned: false,
		});
		expect(levelSetup(scaled, "f1", { hasPlan: true })).toBe("align");

		const aligned = run(scaled, {
			type: "placeUnderlay",
			levelId: "f1",
			placement: { scale: 0.08, rotation: 0.1, x: 3, y: 4 },
		});
		expect(levelSetup(aligned, "f1", { hasPlan: true })).toBe("ready");
	});

	it("keeps the Building's scale when it was set on a blank grid", () => {
		const draft = run(twoLevels(), {
			type: "rescaleBuilding",
			spaces: [],
			placements: {},
			scaleSet: true,
		});
		expect(draft.scaleSet).toBe(true);
		// A plan uploaded later still has its own scale set, then is aligned.
		expect(levelSetup(draft, "f1", { hasPlan: true })).toBe("setScale");
	});

	it("starts again after the plan's Placement is cleared (a new upload)", () => {
		const draft = run(twoLevels(), setScaleOnGround, {
			type: "placeUnderlay",
			levelId: "g",
			placement: null,
		});
		expect(levelSetup(draft, "g", { hasPlan: true })).toBe("setScale");
	});
});

describe("rescaleBuilding and the Building's scale", () => {
	it("records that the scale is set, and undo un-sets it", () => {
		const before = twoLevels();
		const result = applyOperation(before, setScaleOnGround);
		if (!result.ok) throw new Error(result.error);

		expect(before.scaleSet).toBe(false);
		expect(result.draft.scaleSet).toBe(true);
		const undone = applyOperation(result.draft, result.inverse);
		expect(undone.ok && undone.draft).toEqual(before);
	});

	it("treats a rescale logged before scaleSet existed as setting it (ADR 0005)", () => {
		const { scaleSet: _, ...old } = setScaleOnGround as Extract<
			Operation,
			{ type: "rescaleBuilding" }
		>;
		expect(run(twoLevels(), old as Operation).scaleSet).toBe(true);
	});
});
