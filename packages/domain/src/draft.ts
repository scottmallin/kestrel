import type { Space } from "./index.ts";

/** The editable Spaces of the Level being edited, by id. */
export type Draft = { readonly spaces: Readonly<Record<string, Space>> };

export type Operation =
	| { readonly type: "addSpace"; readonly space: Space }
	| { readonly type: "removeSpaces"; readonly ids: readonly string[] }
	| {
			readonly type: "replaceSpaces";
			readonly remove: readonly string[];
			readonly add: readonly Space[];
	  };

export type ApplyResult =
	| { readonly ok: true; readonly draft: Draft; readonly inverse: Operation }
	| { readonly ok: false; readonly error: string };

export const emptyDraft = (): Draft => ({ spaces: {} });

export function applyOperation(
	draft: Draft,
	operation: Operation,
): ApplyResult {
	switch (operation.type) {
		case "addSpace":
			return replace(draft, [], [operation.space], {
				type: "removeSpaces",
				ids: [operation.space.id],
			});
		case "removeSpaces":
			return replace(draft, operation.ids, []);
		case "replaceSpaces":
			return replace(draft, operation.remove, operation.add);
	}
}

/** Removes then adds Spaces; the inverse swaps them back unless a more specific one is given. */
function replace(
	draft: Draft,
	remove: readonly string[],
	add: readonly Space[],
	inverse?: Operation,
): ApplyResult {
	const spaces = { ...draft.spaces };
	const removed: Space[] = [];
	for (const id of remove) {
		const space = spaces[id];
		if (!space) return { ok: false, error: `No Space with id ${id}` };
		removed.push(space);
		delete spaces[id];
	}
	for (const space of add) {
		if (spaces[space.id])
			return { ok: false, error: `A Space with id ${space.id} already exists` };
		if (space.outline.length < 3)
			return { ok: false, error: `Space ${space.id} needs at least 3 corners` };
		spaces[space.id] = space;
	}
	return {
		ok: true,
		draft: { spaces },
		inverse: inverse ?? {
			type: "replaceSpaces",
			remove: add.map((s) => s.id),
			add: removed,
		},
	};
}
