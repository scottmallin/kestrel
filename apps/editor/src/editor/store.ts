import {
	createHistory,
	type Draft,
	emptyDraft,
	type History,
	type Operation,
	parseOperation,
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

export type EditorStoreOptions = {
	/** Called with each Operation actually applied, including the inverses that undo and redo apply. */
	onApplied?: (operation: Operation) => void;
};

export function createEditorStore(
	draft: Draft = emptyDraft(),
	{ onApplied }: EditorStoreOptions = {},
) {
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
				// The server checks Operations the same way; refusing here keeps one bad field from stopping saves.
				const parsed = parseOperation(operation);
				if (!parsed.ok) return set({ error: parsed.error });
				const result = perform(get().history, operation);
				if (!result.ok) return set({ error: result.error });
				moveTo(result.history);
				onApplied?.(operation);
			},
			undo: () => {
				const inverse = get().history.undoStack.at(-1);
				if (!inverse) return;
				moveTo(undo(get().history));
				onApplied?.(inverse);
			},
			redo: () => {
				const operation = get().history.redoStack.at(-1);
				if (!operation) return;
				moveTo(redo(get().history));
				onApplied?.(operation);
			},
			select: (ids) =>
				set({
					selection: ids.filter((id) => id in get().history.draft.spaces),
				}),
		};
	});
}

export type EditorStore = ReturnType<typeof createEditorStore>;
