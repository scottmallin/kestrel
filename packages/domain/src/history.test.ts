import { describe, expect, it } from "vitest";
import { type Draft, emptyDraft, type Operation } from "./draft.ts";
import { createHistory, type History, perform, redo, undo } from "./history.ts";
import type { Space } from "./index.ts";

/** A Draft with just a ground floor, "l1", for Spaces to go on. */
const groundOnly = (): Draft => ({
	...emptyDraft(),
	levels: { l1: { id: "l1", name: "Ground floor", ordinal: 0 } },
});

const box = (id: string, x: number): Space => ({
	id,
	levelId: "l1",
	kind: "unit",
	outline: [
		{ x, y: 0 },
		{ x: x + 10, y: 0 },
		{ x: x + 10, y: 8 },
		{ x, y: 8 },
	],
});

function performOk(history: History, operation: Operation): History {
	const result = perform(history, operation);
	if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
	return result.history;
}

const ids = (history: History) => Object.keys(history.draft.spaces).sort();

describe("History", () => {
	it("undoes and redoes performed Operations in order", () => {
		let h = createHistory(groundOnly());
		h = performOk(h, { type: "addSpace", space: box("a", 0) });
		h = performOk(h, { type: "addSpace", space: box("b", 10) });
		expect(ids(h)).toEqual(["a", "b"]);

		h = undo(h);
		expect(ids(h)).toEqual(["a"]);
		h = undo(h);
		expect(ids(h)).toEqual([]);

		h = redo(h);
		expect(ids(h)).toEqual(["a"]);
		h = redo(h);
		expect(ids(h)).toEqual(["a", "b"]);
	});

	it("forgets undone Operations once a new one is performed", () => {
		let h = createHistory(groundOnly());
		h = performOk(h, { type: "addSpace", space: box("a", 0) });
		h = undo(h);
		h = performOk(h, { type: "addSpace", space: box("b", 10) });

		expect(redo(h)).toBe(h);
		expect(ids(h)).toEqual(["b"]);
	});

	it("does nothing when there is nothing to undo or redo", () => {
		const h = createHistory(groundOnly());
		expect(undo(h)).toBe(h);
		expect(redo(h)).toBe(h);
	});

	it("leaves the History unchanged when an Operation is rejected", () => {
		const h = performOk(createHistory(groundOnly()), {
			type: "addSpace",
			space: box("a", 0),
		});
		const result = perform(h, { type: "removeSpaces", ids: ["missing"] });

		expect(result).toEqual({ ok: false, error: "No Space with id missing" });
		expect(undo(h).draft).toEqual(groundOnly());
	});
});
