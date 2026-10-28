import type { Listing, Space, SpaceKind } from "./index.ts";

/** The editable working copy of a Map: its Spaces and Listings, by id. */
export type Draft = {
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
	| { readonly type: "removeListing"; readonly id: string };

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

export const emptyDraft = (): Draft => ({ spaces: {}, listings: {} });

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
		draft: { ...draft, spaces },
		inverse: inverse ?? {
			type: "replaceSpaces",
			remove: add.map((s) => s.id),
			add: removed,
		},
	};
}
