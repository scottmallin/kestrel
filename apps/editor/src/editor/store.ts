import {
	createHistory,
	type Draft,
	emptyDraft,
	type History,
	type Operation,
	perform,
	redo,
	undo,
} from "@kestrel/domain";
import { createStore } from "zustand/vanilla";

export type EditorState = {
	readonly history: History;
	/** Ids of the selected Spaces; always ones that exist in the Draft. */
	readonly selection: readonly string[];
	/** Why the last Operation was rejected, if it was. */
	readonly error: string | null;
	perform: (operation: Operation) => void;
	undo: () => void;
	redo: () => void;
	select: (ids: readonly string[]) => void;
};

export function createEditorStore(draft: Draft = emptyDraft()) {
	return createStore<EditorState>()((set, get) => {
		/** Moves to a new History, keeping only selected Spaces that still exist. */
		const moveTo = (history: History) =>
			set({
				history,
				error: null,
				selection: get().selection.filter((id) => id in history.draft.spaces),
			});

		return {
			history: createHistory(draft),
			selection: [],
			error: null,
			perform: (operation) => {
				const result = perform(get().history, operation);
				if (result.ok) moveTo(result.history);
				else set({ error: result.error });
			},
			undo: () => moveTo(undo(get().history)),
			redo: () => moveTo(redo(get().history)),
			select: (ids) =>
				set({
					selection: ids.filter((id) => id in get().history.draft.spaces),
				}),
		};
	});
}

export type EditorStore = ReturnType<typeof createEditorStore>;
