import type { Draft, SpaceKind } from "@kestrel/domain";
import { type Point, type Polygon, polygonArea } from "@kestrel/geometry";
import { BUNDLE_FORMAT_VERSION } from "./index.ts";

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
		area: number;
	};
};

/** Everything an Embed needs to show one Published Version of a Map. */
export type PublishedBundle = {
	format: typeof BUNDLE_FORMAT_VERSION;
	map: { id: string; name: string };
	version: number;
	publishedAt: string;
	levels: { id: string; name: string; ordinal: number }[];
	spaces: { type: "FeatureCollection"; features: SpaceFeature[] };
	/** What Visitors can search for, in display order. Until Listings exist, Spaces with a Space Reference. */
	directory: DirectoryEntry[];
	/** [west, south, east, north] around every Space, or null if nothing is drawn. */
	bounds: [number, number, number, number] | null;
};

export type DirectoryEntry = {
	spaceId: string;
	levelId: string;
	label: string;
	kind: SpaceKind;
};

const naturalOrder = new Intl.Collator("en", {
	numeric: true,
	sensitivity: "base",
});

export type CompileInput = {
	map: { id: string; name: string };
	levels: readonly { id: string; name: string; ordinal: number }[];
	draft: Draft;
	version: number;
	publishedAt: string;
};

/** Compiles a Draft into the bundle an Embed loads. Pure: the same input always gives the same bundle. */
export function compileBundle({
	map,
	levels,
	draft,
	version,
	publishedAt,
}: CompileInput): PublishedBundle {
	// Sorted by id, so the bundle doesn't depend on the order Spaces were drawn in.
	const spaces = Object.values(draft.spaces).sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	const features = spaces.map(
		(space): SpaceFeature => ({
			type: "Feature",
			geometry: { type: "Polygon", coordinates: [ring(space.outline)] },
			properties: {
				id: space.id,
				levelId: space.levelId,
				kind: space.kind,
				...(space.reference !== undefined && { reference: space.reference }),
				area: Math.round(polygonArea(space.outline) * 10) / 10,
			},
		}),
	);
	return {
		format: BUNDLE_FORMAT_VERSION,
		map: { id: map.id, name: map.name },
		version,
		publishedAt,
		levels: [...levels],
		spaces: { type: "FeatureCollection", features },
		bounds: boundsOf(features),
		directory: spaces
			.flatMap((s): DirectoryEntry[] =>
				s.reference
					? [
							{
								spaceId: s.id,
								levelId: s.levelId,
								label: s.reference,
								kind: s.kind,
							},
						]
					: [],
			)
			.sort((a, b) => naturalOrder.compare(a.label, b.label)),
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

/** Positive for anticlockwise rings (in lng/lat, north up). */
function signedArea(positions: readonly Position[]): number {
	let twice = 0;
	positions.forEach(([x1, y1], i) => {
		const [x2, y2] = positions[(i + 1) % positions.length] as Position;
		twice += x1 * y2 - x2 * y1;
	});
	return twice / 2;
}
