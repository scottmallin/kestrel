import type { Level, Listing, Space, SpaceKind } from "./index.ts";

/** The editable working copy of a Map: its Levels, Spaces and Listings, by id. */
export type Draft = {
	readonly levels: Readonly<Record<string, Level>>;
	readonly spaces: Readonly<Record<string, Space>>;
	readonly listings: Readonly<Record<string, Listing>>;
};

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
	  }
	| { readonly type: "addListing"; readonly listing: Listing }
	| {
			readonly type: "updateListing";
			readonly id: string;
			readonly changes: ListingChanges;
	  }
	| { readonly type: "removeListing"; readonly id: string }
	| {
			readonly type: "addLevel";
			readonly level: Level;
			/** Spaces on the new Level, used when undoing its removal. */
			readonly spaces?: readonly Space[];
	  }
	| {
			readonly type: "updateLevel";
			readonly id: string;
			readonly changes: LevelChanges;
	  }
	| {
			readonly type: "reorderLevels";
			/** New ordinals by Level id; Levels not listed keep theirs. */
			readonly ordinals: Readonly<Record<string, number>>;
	  }
	| { readonly type: "removeLevel"; readonly id: string };

export type LevelChanges = { readonly name?: string };

/** Optional details of a Listing; null clears one. */
const OPTIONAL_LISTING_FIELDS = [
	"categoryId",
	"logoKey",
	"description",
	"website",
	"hours",
] as const;
type OptionalListingField = (typeof OPTIONAL_LISTING_FIELDS)[number];

/** Changes to a Listing: its name, placement, and any optional detail (null clears it). */
export type ListingChanges = {
	readonly name?: string;
	readonly spaceIds?: readonly string[];
} & { readonly [K in OptionalListingField]?: string | null };

/** Details of a Space other than its outline; a null reference clears it. */
export type SpaceChanges = {
	readonly kind?: SpaceKind;
	readonly reference?: string | null;
};

export type ApplyResult =
	| { readonly ok: true; readonly draft: Draft; readonly inverse: Operation }
	| { readonly ok: false; readonly error: string };

export const emptyDraft = (): Draft => ({
	levels: {},
	spaces: {},
	listings: {},
});

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
		case "addListing": {
			const { listing } = operation;
			if (draft.listings[listing.id])
				return {
					ok: false,
					error: `A Listing with id ${listing.id} already exists`,
				};
			if (!listing.name.trim())
				return { ok: false, error: `Listing ${listing.id} needs a name` };
			return {
				ok: true,
				draft: {
					...draft,
					listings: { ...draft.listings, [listing.id]: listing },
				},
				inverse: { type: "removeListing", id: listing.id },
			};
		}
		case "updateListing": {
			const listing = draft.listings[operation.id];
			if (!listing)
				return { ok: false, error: `No Listing with id ${operation.id}` };
			const { changes } = operation;
			if (changes.name !== undefined && !changes.name.trim()) {
				return { ok: false, error: `Listing ${listing.id} needs a name` };
			}
			const updated: Record<string, unknown> = { ...listing };
			const previous: Record<string, unknown> = {};
			if (changes.name !== undefined) {
				previous.name = listing.name;
				updated.name = changes.name;
			}
			if (changes.spaceIds !== undefined) {
				previous.spaceIds = listing.spaceIds;
				updated.spaceIds = changes.spaceIds;
			}
			for (const field of OPTIONAL_LISTING_FIELDS) {
				const change = changes[field];
				if (change === undefined) continue;
				previous[field] = listing[field] ?? null;
				if (change === null) delete updated[field];
				else updated[field] = change;
			}
			return {
				ok: true,
				draft: {
					...draft,
					listings: { ...draft.listings, [listing.id]: updated as Listing },
				},
				inverse: {
					type: "updateListing",
					id: listing.id,
					changes: previous as ListingChanges,
				},
			};
		}
		case "removeListing": {
			const listing = draft.listings[operation.id];
			if (!listing)
				return { ok: false, error: `No Listing with id ${operation.id}` };
			const { [operation.id]: _, ...listings } = draft.listings;
			return {
				ok: true,
				draft: { ...draft, listings },
				inverse: { type: "addListing", listing },
			};
		}
		case "addLevel": {
			const { level } = operation;
			if (draft.levels[level.id])
				return {
					ok: false,
					error: `A Level with id ${level.id} already exists`,
				};
			const levels = { ...draft.levels, [level.id]: level };
			const invalid = checkLevels(levels, [level.id]);
			if (invalid) return invalid;
			const spaces = operation.spaces ?? [];
			const stray = spaces.find((s) => s.levelId !== level.id);
			if (stray)
				return {
					ok: false,
					error: `Space ${stray.id} is not on Level ${level.id}`,
				};
			const added = replace({ ...draft, levels }, [], spaces);
			if (!added.ok) return added;
			return {
				ok: true,
				draft: added.draft,
				inverse: { type: "removeLevel", id: level.id },
			};
		}
		case "updateLevel": {
			const level = draft.levels[operation.id];
			if (!level)
				return { ok: false, error: `No Level with id ${operation.id}` };
			const { name } = operation.changes;
			const levels = {
				...draft.levels,
				[level.id]: { ...level, ...(name !== undefined && { name }) },
			};
			const invalid = checkLevels(levels, [level.id]);
			if (invalid) return invalid;
			return {
				ok: true,
				draft: { ...draft, levels },
				inverse: {
					type: "updateLevel",
					id: level.id,
					changes: name !== undefined ? { name: level.name } : {},
				},
			};
		}
		case "reorderLevels": {
			const levels: Record<string, Level> = { ...draft.levels };
			const previous: Record<string, number> = {};
			for (const [id, ordinal] of Object.entries(operation.ordinals)) {
				const level = levels[id];
				if (!level) return { ok: false, error: `No Level with id ${id}` };
				previous[id] = level.ordinal;
				levels[id] = { ...level, ordinal };
			}
			const invalid = checkLevels(levels, Object.keys(operation.ordinals));
			if (invalid) return invalid;
			return {
				ok: true,
				draft: { ...draft, levels },
				inverse: { type: "reorderLevels", ordinals: previous },
			};
		}
		case "removeLevel": {
			const level = draft.levels[operation.id];
			if (!level)
				return { ok: false, error: `No Level with id ${operation.id}` };
			if (Object.keys(draft.levels).length === 1)
				return { ok: false, error: "A Map needs at least one Level" };
			const { [level.id]: _, ...levels } = draft.levels;
			const onLevel = Object.values(draft.spaces).filter(
				(s) => s.levelId === level.id,
			);
			const spaces = { ...draft.spaces };
			for (const space of onLevel) delete spaces[space.id];
			return {
				ok: true,
				draft: { ...draft, levels, spaces },
				inverse: {
					type: "addLevel",
					level,
					...(onLevel.length > 0 && { spaces: onLevel }),
				},
			};
		}
	}
}

/** Checks the given Levels have a name and a whole-number ordinal no other Level has. */
function checkLevels(
	levels: Readonly<Record<string, Level>>,
	ids: readonly string[],
): ApplyResult | undefined {
	for (const id of ids) {
		const level = levels[id] as Level;
		if (!level.name.trim())
			return { ok: false, error: `Level ${id} needs a name` };
		if (!Number.isInteger(level.ordinal))
			return { ok: false, error: `Level ${id} needs a whole-number ordinal` };
		const clash = Object.values(levels).find(
			(other) => other.id !== id && other.ordinal === level.ordinal,
		);
		if (clash)
			return {
				ok: false,
				error: `${clash.name} is already Level ${clash.ordinal}`,
			};
	}
	return undefined;
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
		if (!draft.levels[space.levelId])
			return {
				ok: false,
				error: `Space ${space.id} is on Level ${space.levelId}, which doesn't exist`,
			};
		if (space.outline.length < 3)
			return { ok: false, error: `Space ${space.id} needs at least 3 corners` };
		spaces[space.id] = space;
	}
	return {
		ok: true,
		draft: { ...draft, spaces },
		inverse: inverse ?? {
			type: "replaceSpaces",
			remove: add.map((s) => s.id),
			add: removed,
		},
	};
}
