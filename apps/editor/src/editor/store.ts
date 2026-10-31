import {
	createHistory,
	type Draft,
	emptyDraft,
	type History,
	type Level,
	type Operation,
	parseOperation,
	perform,
	redo,
	undo,
} from "@kestrel/domain";
import { createStore } from "zustand/vanilla";

export type EditorState = {
	readonly history: History;
	/** The Level being shown and edited; always one that exists in the Draft. */
	readonly levelId: string;
	/** Ids of the selected Spaces; always ones that exist on the Level being shown. */
	readonly selection: readonly string[];
	/** Why the last Operation was rejected, if it was. */
	readonly error: string | null;
	perform: (operation: Operation) => void;
	undo: () => void;
	redo: () => void;
	select: (ids: readonly string[]) => void;
	showLevel: (id: string) => void;
};

/** The Level whose floor number is closest to `ordinal` (the ground floor, by default). */
export function nearestLevel(
	levels: Readonly<Record<string, Level>>,
	ordinal = 0,
): Level | undefined {
	return Object.values(levels).sort(
		(a, b) =>
			Math.abs(a.ordinal - ordinal) - Math.abs(b.ordinal - ordinal) ||
			a.ordinal - b.ordinal,
	)[0];
}

export type EditorStoreOptions = {
	/** Called with each Operation actually applied, including the inverses that undo and redo apply. */
	onApplied?: (operation: Operation) => void;
};

export function createEditorStore(
	draft: Draft = emptyDraft(),
	{ onApplied }: EditorStoreOptions = {},
) {
	return createStore<EditorState>()((set, get) => {
		/** Keeps only ids of Spaces that exist on the Level. */
		const onLevel = (ids: readonly string[], draft: Draft, levelId: string) =>
			ids.filter((id) => draft.spaces[id]?.levelId === levelId);

		/** Moves to a new History. If the Level being shown went away, shows the nearest floor instead. */
		const moveTo = (history: History) => {
			const { levels } = history.draft;
			const current = get().levelId;
			const ordinal = get().history.draft.levels[current]?.ordinal ?? 0;
			const levelId =
				current in levels
					? current
					: (nearestLevel(levels, ordinal)?.id ?? current);
			set({
				history,
				levelId,
				error: null,
				selection: onLevel(get().selection, history.draft, levelId),
			});
		};

		return {
			history: createHistory(draft),
			levelId: nearestLevel(draft.levels)?.id ?? "",
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
					selection: onLevel(ids, get().history.draft, get().levelId),
				}),
			showLevel: (id) => {
				if (id in get().history.draft.levels)
					set({ levelId: id, selection: [] });
			},
		};
	});
}

export type EditorStore = ReturnType<typeof createEditorStore>;
