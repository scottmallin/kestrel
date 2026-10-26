import { applyOperation, type Draft, type Operation } from "./draft.ts";

/** A Draft plus the Operations that undo and redo the edits made to it. */
export type History = {
	readonly draft: Draft;
	readonly undoStack: readonly Operation[];
	readonly redoStack: readonly Operation[];
};

export type PerformResult =
	| { readonly ok: true; readonly history: History }
	| { readonly ok: false; readonly error: string };

export const createHistory = (draft: Draft): History => ({
	draft,
	undoStack: [],
	redoStack: [],
});

export function perform(history: History, operation: Operation): PerformResult {
	const result = applyOperation(history.draft, operation);
	if (!result.ok) return result;
	return {
		ok: true,
		history: {
			draft: result.draft,
			undoStack: [...history.undoStack, result.inverse],
			redoStack: [],
		},
	};
}

export function undo(history: History): History {
	const inverse = history.undoStack.at(-1);
	if (!inverse) return history;
	const result = applyOperation(history.draft, inverse);
	if (!result.ok) throw new Error(`Undo failed: ${result.error}`);
	return {
		draft: result.draft,
		undoStack: history.undoStack.slice(0, -1),
		redoStack: [...history.redoStack, result.inverse],
	};
}

export function redo(history: History): History {
	const operation = history.redoStack.at(-1);
	if (!operation) return history;
	const result = applyOperation(history.draft, operation);
	if (!result.ok) throw new Error(`Redo failed: ${result.error}`);
	return {
		draft: result.draft,
		undoStack: [...history.undoStack, result.inverse],
		redoStack: history.redoStack.slice(0, -1),
	};
}
