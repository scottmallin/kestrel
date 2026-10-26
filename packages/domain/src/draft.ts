import type { Space, SpaceKind } from "./index.ts";

/** The editable Spaces of the Level being edited, by id. */
export type Draft = { readonly spaces: Readonly<Record<string, Space>> };

export type Operation =
	| { readonly type: "addSpace"; readonly space: Space }
	| { readonly type: "removeSpaces"; readonly ids: readonly string[] }
	| {
			readonly type: "replaceSpaces";
			readonly remove: readonly string[];
			readonly add: readonly Space[];
	  }
	| {
			readonly type: "reshapeSpace";
			readonly id: string;
			readonly outline: Space["outline"];
	  }
	| {
			readonly type: "updateSpace";
			readonly id: string;
			readonly changes: SpaceChanges;
	  };

/** Details of a Space other than its outline; a null reference clears it. */
export type SpaceChanges = {
	readonly kind?: SpaceKind;
	readonly reference?: string | null;
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
		case "reshapeSpace": {
			const space = draft.spaces[operation.id];
			if (!space)
				return { ok: false, error: `No Space with id ${operation.id}` };
			return replace(
				draft,
				[space.id],
				[{ ...space, outline: operation.outline }],
				{
					type: "reshapeSpace",
					id: space.id,
					outline: space.outline,
				},
			);
		}
		case "updateSpace": {
			const space = draft.spaces[operation.id];
			if (!space)
				return { ok: false, error: `No Space with id ${operation.id}` };
			const { changes } = operation;
			const { reference: _, ...rest } = space;
			const reference =
				changes.reference === undefined ? space.reference : changes.reference;
			const updated: Space = {
				...rest,
				kind: changes.kind ?? space.kind,
				...(reference != null && { reference }),
			};
			const previous: SpaceChanges = {
				...(changes.kind && { kind: space.kind }),
				...(changes.reference !== undefined && {
					reference: space.reference ?? null,
				}),
			};
			return replace(draft, [space.id], [updated], {
				type: "updateSpace",
				id: space.id,
				changes: previous,
			});
		}
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
