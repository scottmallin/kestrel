import type { Space } from "@kestrel/domain";
import { mergeOutlines } from "@kestrel/geometry";
import type { EditorStore } from "./store.ts";
import { newSpaceId } from "./tool.ts";

/** Joins the selected Spaces into one, keeping the first one's details. */
export function mergeSelection(store: EditorStore) {
	const { history, selection, perform, select } = store.getState();
	const chosen = selection
		.map((id) => history.draft.spaces[id])
		.filter((s): s is Space => s !== undefined);
	if (chosen.length < 2) {
		store.setState({
			error: "Shift-click two or more touching Spaces to merge them.",
		});
		return;
	}
	const merged = mergeOutlines(chosen.map((s) => s.outline));
	if (!merged) {
		store.setState({
			error: "Those Spaces don't touch, so they can't be merged.",
		});
		return;
	}
	const [first] = chosen as [Space];
	const id = newSpaceId();
	perform({
		type: "replaceSpaces",
		remove: chosen.map((s) => s.id),
		add: [{ ...first, id, outline: merged }],
	});
	select([id]);
}

export function deleteSelection(store: EditorStore) {
	const { selection, perform } = store.getState();
	if (selection.length > 0) perform({ type: "removeSpaces", ids: selection });
}
