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
