import type { Draft, Listing, Space, SpaceKind } from "@kestrel/domain";
import { type Point, type Polygon, polygonArea } from "@kestrel/geometry";
import { BUNDLE_FORMAT_VERSION } from "./index.ts";
import { SPACE_KIND_LABELS } from "./style.ts";

/** Metres per degree of longitude (and latitude) at 0°, 0°, where un-pinned Buildings are placed (ADR 0003). */
export const METRES_PER_DEGREE = 111_320;

type Position = [lng: number, lat: number];

export type SpaceFeature = {
	type: "Feature";
	geometry: { type: "Polygon"; coordinates: Position[][] };
	properties: {
		id: string;
		levelId: string;
		kind: SpaceKind;
		reference?: string;
		/** What to write on the map: the Listing's name if it has one, else its Space Reference. */
		label?: string;
		area: number;
	};
};

export type PublishedListing = {
	id: string;
	name: string;
	categoryId?: string;
	/** Only Spaces that exist in this Published Version. */
	spaceIds: string[];
	logoUrl?: string;
	description?: string;
	website?: string;
	hours?: string;
};

/** One thing a Visitor can find: a Listing, or a facility Space such as toilets or a lift. */
export type DirectoryEntry = {
	/** The Listing's or the Space's id. */
	id: string;
	label: string;
	/** A second line: the Category, or the Space Kind. Empty if there's nothing useful to add. */
	detail: string;
	categoryId: string | null;
	spaceIds: string[];
};

/** Everything an Embed needs to show one Published Version of a Map. */
export type PublishedBundle = {
	format: typeof BUNDLE_FORMAT_VERSION;
	map: { id: string; name: string };
	version: number;
	publishedAt: string;
	/** Lowest floor first; 0 is the ground floor. */
	levels: { id: string; name: string; ordinal: number }[];
	spaces: { type: "FeatureCollection"; features: SpaceFeature[] };
	/** Placed Listings only; Unplaced Listings are never published. */
	listings: PublishedListing[];
	/** The Categories those Listings use. */
	categories: { id: string; name: string }[];
	/** What Visitors can search for, in display order. */
	directory: DirectoryEntry[];
	/** [west, south, east, north] around every Space, or null if nothing is drawn. */
	bounds: [number, number, number, number] | null;
};

export type CompileInput = {
	map: { id: string; name: string };
	/** The Organisation's Categories; Listings pointing at any other id count as uncategorised. */
	categories: readonly { id: string; name: string }[];
	/** Public URL for a logo's storage key. */
	logoUrl: (key: string) => string;
	draft: Draft;
	version: number;
	publishedAt: string;
};

/** Space Kinds Visitors look for even without a Listing. */
const FACILITY_KINDS: readonly SpaceKind[] = [
	"toilet",
	"lift",
	"stairs",
	"escalator",
	"entrance",
];

const naturalOrder = new Intl.Collator("en", {
	numeric: true,
	sensitivity: "base",
});

const byId = <T extends { id: string }>(a: T, b: T) =>
	a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Compiles a Draft into the bundle an Embed loads. Pure: the same input always gives the same bundle. */
export function compileBundle(input: CompileInput): PublishedBundle {
	const { map, draft, version, publishedAt } = input;
	// Lowest floor first (ADR 0007).
	const levels = Object.values(draft.levels)
		.map(({ id, name, ordinal }) => ({ id, name, ordinal }))
		.sort((a, b) => a.ordinal - b.ordinal);
	// Sorted by id, so the bundle doesn't depend on the order things were drawn in.
	const spaces = Object.values(draft.spaces).sort(byId);
	const categories = new Map(input.categories.map((c) => [c.id, c.name]));
	const listings = Object.values(draft.listings)
		.sort(byId)
		.map((listing) => publishListing(listing, draft, categories, input.logoUrl))
		.filter((l): l is PublishedListing => l !== null);

	const listingNameBySpace = new Map<string, string>();
	for (const listing of listings) {
		for (const spaceId of listing.spaceIds)
			if (!listingNameBySpace.has(spaceId))
				listingNameBySpace.set(spaceId, listing.name);
	}

	const features = spaces.map((space): SpaceFeature => {
		const label = listingNameBySpace.get(space.id) ?? space.reference;
		return {
			type: "Feature",
			geometry: { type: "Polygon", coordinates: [ring(space.outline)] },
			properties: {
				id: space.id,
				levelId: space.levelId,
				kind: space.kind,
				...(space.reference !== undefined && { reference: space.reference }),
				...(label !== undefined && { label }),
				area: Math.round(polygonArea(space.outline) * 10) / 10,
			},
		};
	});

	const usedCategories = [
		...new Set(listings.flatMap((l) => (l.categoryId ? [l.categoryId] : []))),
	]
		.sort()
		.map((id) => ({ id, name: categories.get(id) as string }));

	return {
		format: BUNDLE_FORMAT_VERSION,
		map: { id: map.id, name: map.name },
		version,
		publishedAt,
		levels,
		spaces: { type: "FeatureCollection", features },
		listings,
		categories: usedCategories,
		directory: [
			...listings.map(listingEntry(categories)),
			...spaces.filter(isFacility).map(facilityEntry),
		].sort((a, b) => naturalOrder.compare(a.label, b.label)),
		bounds: boundsOf(features),
	};
}

/** The Listing as Visitors see it, or null if none of its Spaces exist (an Unplaced Listing). */
function publishListing(
	listing: Listing,
	draft: Draft,
	categories: ReadonlyMap<string, string>,
	logoUrl: (key: string) => string,
): PublishedListing | null {
	const spaceIds = listing.spaceIds.filter((id) => id in draft.spaces);
	if (spaceIds.length === 0) return null;
	return {
		id: listing.id,
		name: listing.name,
		...(listing.categoryId &&
			categories.has(listing.categoryId) && { categoryId: listing.categoryId }),
		spaceIds,
		...(listing.logoKey && { logoUrl: logoUrl(listing.logoKey) }),
		...(listing.description && { description: listing.description }),
		...(listing.website && { website: listing.website }),
		...(listing.hours && { hours: listing.hours }),
	};
}

const listingEntry =
	(categories: ReadonlyMap<string, string>) =>
	(listing: PublishedListing): DirectoryEntry => ({
		id: listing.id,
		label: listing.name,
		detail: listing.categoryId
			? (categories.get(listing.categoryId) ?? "")
			: "",
		categoryId: listing.categoryId ?? null,
		spaceIds: listing.spaceIds,
	});

const isFacility = (space: Space) => FACILITY_KINDS.includes(space.kind);

function facilityEntry(space: Space): DirectoryEntry {
	const kind = SPACE_KIND_LABELS[space.kind];
	return {
		id: space.id,
		label: space.reference ?? kind,
		detail: space.reference ? kind : "",
		categoryId: null,
		spaceIds: [space.id],
	};
}

/** Local metres (y down) to a closed ring of [lng, lat] at 0°, 0°. */
function ring(outline: Polygon): Position[] {
	let positions = outline.map(
		(p: Point): Position => [
			p.x / METRES_PER_DEGREE,
			0 - p.y / METRES_PER_DEGREE,
		],
	);
	// GeoJSON (RFC 7946) wants outer rings anticlockwise.
	if (signedArea(positions) < 0) positions = positions.reverse();
	const first = positions[0];
	return first ? [...positions, first] : positions;
}

/** Positive for anticlockwise rings (in lng/lat, north up). */
function signedArea(positions: readonly Position[]): number {
	let twice = 0;
	positions.forEach(([x1, y1], i) => {
		const [x2, y2] = positions[(i + 1) % positions.length] as Position;
		twice += x1 * y2 - x2 * y1;
	});
	return twice / 2;
}

function boundsOf(
	features: readonly SpaceFeature[],
): PublishedBundle["bounds"] {
	const positions = features.flatMap((f) => f.geometry.coordinates.flat());
	if (positions.length === 0) return null;
	const lngs = positions.map(([lng]) => lng);
	const lats = positions.map(([, lat]) => lat);
	return [
		Math.min(...lngs),
		Math.min(...lats),
		Math.max(...lngs),
		Math.max(...lats),
	];
}
