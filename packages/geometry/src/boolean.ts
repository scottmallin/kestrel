import polygonClipping, {
	type Polygon as ClipPolygon,
	type Ring,
} from "polygon-clipping";
import { type Point, type Polygon, polygonArea } from "./index.ts";

/**
 * Cuts an outline along the segment from a to b. Only boundaries that lie on the segment are cut,
 * so a line that stops inside the shape, or crosses one arm of a U, cuts nothing beyond itself.
 * Returns null if nothing was cut.
 */
export function splitOutline(
	outline: Polygon,
	a: Point,
	b: Point,
): Polygon[] | null {
	const sides = ([1, -1] as const).map((side) =>
		polygonClipping
			.intersection(toClip(outline), toClip(halfPlane(a, b, side)))
			.map(fromClip),
	);
	const [left = [], right = []] = sides;
	const pieces = [...left, ...right];

	// Rejoin pieces across the line wherever their shared boundary is not covered by the segment.
	const group = pieces.map((_, i) => i);
	const find = (i: number): number =>
		group[i] === i ? i : find(group[i] as number);
	left.forEach((l, i) => {
		right.forEach((r, j) => {
			const shared = overlaps(onLine(l, a, b), onLine(r, a, b));
			if (shared.some(([t0, t1]) => t0 < -EPSILON || t1 > 1 + EPSILON))
				group[find(left.length + j)] = find(i);
		});
	});

	const groups = new Map<number, Polygon[]>();
	for (const [i, piece] of pieces.entries()) {
		groups.set(find(i), [...(groups.get(find(i)) ?? []), piece]);
	}
	if (groups.size < 2) return null;
	return [...groups.values()].map((members) => {
		const [first, ...rest] = members.map(toClip);
		return fromClip(
			polygonClipping.union(first as ClipPolygon, ...rest)[0] as ClipPolygon,
		);
	});
}

const EPSILON = 1e-9;

/** Intervals (as positions along a→b, where a is 0 and b is 1) covered by the outline's edges lying on that line. */
function onLine(outline: Polygon, a: Point, b: Point): [number, number][] {
	const d = { x: b.x - a.x, y: b.y - a.y };
	const lengthSquared = d.x * d.x + d.y * d.y;
	const t = (p: Point) =>
		((p.x - a.x) * d.x + (p.y - a.y) * d.y) / lengthSquared;
	const offLine = (p: Point) =>
		Math.abs(d.x * (p.y - a.y) - d.y * (p.x - a.x)) / Math.sqrt(lengthSquared);
	const intervals: [number, number][] = [];
	outline.forEach((p, i) => {
		const q = outline[(i + 1) % outline.length] as Point;
		if (offLine(p) < 1e-6 && offLine(q) < 1e-6)
			intervals.push([Math.min(t(p), t(q)), Math.max(t(p), t(q))]);
	});
	return intervals;
}

function overlaps(
	xs: [number, number][],
	ys: [number, number][],
): [number, number][] {
	return xs.flatMap(([x0, x1]) =>
		ys.flatMap(([y0, y1]): [number, number][] => {
			const start = Math.max(x0, y0);
			const end = Math.min(x1, y1);
			return end - start > EPSILON ? [[start, end]] : [];
		}),
	);
}

const FAR = 1e6;

/** A huge rectangle covering one side of the line through a and b. */
function halfPlane(a: Point, b: Point, side: 1 | -1): Polygon {
	const length = Math.hypot(b.x - a.x, b.y - a.y);
	const u = {
		x: ((b.x - a.x) / length) * FAR,
		y: ((b.y - a.y) / length) * FAR,
	};
	const n = { x: -u.y * side, y: u.x * side };
	return [
		{ x: a.x - u.x, y: a.y - u.y },
		{ x: a.x + u.x, y: a.y + u.y },
		{ x: a.x + u.x + n.x, y: a.y + u.y + n.y },
		{ x: a.x - u.x + n.x, y: a.y - u.y + n.y },
	];
}

const toClip = (outline: Polygon): ClipPolygon => [
	outline.map((p): [number, number] => [p.x, p.y]),
];

/** Outer ring only; library rings repeat the first point at the end. */
const fromClip = (polygon: ClipPolygon): Polygon =>
	((polygon[0] ?? []) as Ring).slice(0, -1).map(([x, y]) => ({ x, y }));

/** Joins outlines into one; null if they don't form a single connected shape. */
export function mergeOutlines(outlines: readonly Polygon[]): Polygon | null {
	const [first, ...rest] = outlines.map(toClip);
	if (!first) return null;
	const union = polygonClipping.union(first, ...rest);
	return union.length === 1 ? fromClip(union[0] as ClipPolygon) : null;
}

export type Overlap = {
	readonly between: readonly [number, number];
	readonly region: Polygon;
};

/** Every place two outlines overlap by more than minArea; between holds their indexes. */
export function findOverlaps(
	outlines: readonly Polygon[],
	minArea: number,
): Overlap[] {
	const found: Overlap[] = [];
	outlines.forEach((a, i) => {
		outlines.slice(i + 1).forEach((b, k) => {
			for (const polygon of polygonClipping.intersection(
				toClip(a),
				toClip(b),
			)) {
				const region = fromClip(polygon);
				if (polygonArea(region) > minArea)
					found.push({ between: [i, i + 1 + k], region });
			}
		});
	});
	return found;
}
