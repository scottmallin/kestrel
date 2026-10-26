import { describe, expect, it } from "vitest";
import { emptyDraft, type Operation } from "./draft.ts";
import { createHistory, type History, perform, redo, undo } from "./history.ts";
import type { Space } from "./index.ts";

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
		let h = createHistory(emptyDraft());
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
		let h = createHistory(emptyDraft());
		h = performOk(h, { type: "addSpace", space: box("a", 0) });
		h = undo(h);
		h = performOk(h, { type: "addSpace", space: box("b", 10) });

		expect(redo(h)).toBe(h);
		expect(ids(h)).toEqual(["b"]);
	});

	it("does nothing when there is nothing to undo or redo", () => {
		const h = createHistory(emptyDraft());
		expect(undo(h)).toBe(h);
		expect(redo(h)).toBe(h);
	});

	it("leaves the History unchanged when an Operation is rejected", () => {
		const h = performOk(createHistory(emptyDraft()), {
			type: "addSpace",
			space: box("a", 0),
		});
		const result = perform(h, { type: "removeSpaces", ids: ["missing"] });

		expect(result).toEqual({ ok: false, error: "No Space with id missing" });
		expect(undo(h).draft).toEqual(emptyDraft());
	});
});
