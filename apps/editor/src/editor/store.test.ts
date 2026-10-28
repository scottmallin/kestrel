import type { Space } from "@kestrel/domain";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "./store.ts";

const box = (id: string, x: number): Space => ({
	id,
	levelId: "level-1",
	kind: "unit",
	outline: [
		{ x, y: 0 },
		{ x: x + 10, y: 0 },
		{ x: x + 10, y: 8 },
		{ x, y: 8 },
	],
});

const spaceIds = (store: ReturnType<typeof createEditorStore>) =>
	Object.keys(store.getState().history.draft.spaces).sort();

describe("editor store", () => {
	it("performs Operations and undoes them", () => {
		const store = createEditorStore();
		store.getState().perform({ type: "addSpace", space: box("a", 0) });
		expect(spaceIds(store)).toEqual(["a"]);

		store.getState().undo();
		expect(spaceIds(store)).toEqual([]);

		store.getState().redo();
		expect(spaceIds(store)).toEqual(["a"]);
	});

	it("shows why an Operation was rejected, until the next successful one", () => {
		const store = createEditorStore();
		store.getState().perform({ type: "removeSpaces", ids: ["ghost"] });
		expect(store.getState().error).toBe("No Space with id ghost");
		expect(spaceIds(store)).toEqual([]);

		store.getState().perform({ type: "addSpace", space: box("a", 0) });
		expect(store.getState().error).toBeNull();
	});

	it("reports every Operation it applies, including undo and redo, so they can be saved", () => {
		const applied: string[] = [];
		const store = createEditorStore(undefined, {
			onApplied: (op) =>
				applied.push(op.type === "addSpace" ? `add ${op.space.id}` : op.type),
		});
		store.getState().perform({ type: "addSpace", space: box("a", 0) });
		store.getState().perform({ type: "removeSpaces", ids: ["ghost"] }); // rejected: not reported
		store.getState().undo();
		store.getState().redo();

		// Redo re-applies the inverse of the undo, which for a removal is a replaceSpaces (ADR 0004).
		expect(applied).toEqual(["add a", "removeSpaces", "replaceSpaces"]);
	});

	it("refuses an Operation the server would refuse, without applying or reporting it", () => {
		const applied: unknown[] = [];
		const store = createEditorStore(undefined, {
			onApplied: (op) => applied.push(op),
		});

		store.getState().perform({
			type: "addListing",
			listing: { id: "x", name: "X", spaceIds: [], website: "boots.com" },
		});

		expect(store.getState().error).toBe(
			"website must start with http:// or https://",
		);
		expect(store.getState().history.draft.listings).toEqual({});
		expect(applied).toEqual([]);
	});

	describe("selection", () => {
		it("drops Spaces that undo takes away", () => {
			const store = createEditorStore();
			store.getState().perform({ type: "addSpace", space: box("a", 0) });
			store.getState().perform({ type: "addSpace", space: box("b", 10) });
			store.getState().select(["a", "b"]);

			store.getState().undo();

			expect(store.getState().selection).toEqual(["a"]);
		});

		it("drops Spaces that an Operation replaces", () => {
			const store = createEditorStore();
			store.getState().perform({ type: "addSpace", space: box("a", 0) });
			store.getState().select(["a"]);

			store.getState().perform({
				type: "replaceSpaces",
				remove: ["a"],
				add: [box("a1", 0), box("a2", 10)],
			});

			expect(store.getState().selection).toEqual([]);
		});
	});
});
