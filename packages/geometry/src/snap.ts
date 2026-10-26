import type { Point, Polygon } from "./index.ts";

export type SnapKind =
	| "close"
	| "corner"
	| "edge"
	| "angle"
	| "align"
	| "grid"
	| "none";

export type Snap = {
	readonly point: Point;
	readonly kind: SnapKind;
	/** Dashed lines to draw, from the thing snapped to towards the snapped point. */
	readonly guides: readonly (readonly [Point, Point])[];
};

export type SnapContext = {
	readonly outlines: readonly Polygon[];
	/** Snapping distance, in the same units as the points. */
	readonly tolerance: number;
	/** Corners placed so far in a shape being drawn, in order. */
	readonly drawing?: readonly Point[];
	/** Grid spacing to fall back to when nothing else snaps; omit for no grid. */
	readonly grid?: number;
	/** A corner being dragged: it and its two edges are not snap targets. */
	readonly exclude?: { readonly outline: number; readonly corner: number };
};

export function snap(point: Point, context: SnapContext): Snap {
	const drawing = context.drawing ?? [];
	const first = drawing[0];
	if (
		first &&
		drawing.length >= 3 &&
		distance(point, first) <= context.tolerance
	) {
		return { point: first, kind: "close", guides: [] };
	}

	const { exclude } = context;
	const isExcluded = (outline: number, corner: number) =>
		exclude?.outline === outline && exclude.corner === corner;
	const corners = [
		...context.outlines.flatMap((o, i) =>
			o.filter((_, c) => !isExcluded(i, c)),
		),
		...drawing,
	];
	const corner = closest(point, corners, context.tolerance);
	if (corner) return { point: corner, kind: "corner", guides: [] };

	const onEdges = context.outlines.flatMap((outline, i) =>
		[...edges(outline)]
			.filter(({ from, to }) => !isExcluded(i, from) && !isExcluded(i, to))
			.map(({ a, b }) => nearestOnSegment(point, a, b)),
	);
	const edge = closest(point, onEdges, context.tolerance);
	if (edge) return { point: edge, kind: "edge", guides: [] };

	const last = drawing.at(-1);
	const straightened = last && straighten(point, last);
	let result: Snap = straightened
		? { point: straightened.point, kind: "angle", guides: [] }
		: { point, kind: "none", guides: [] };

	// A straightened line already fixes x (vertical), y (horizontal) or both (diagonal).
	const direction = straightened?.direction;
	let fixedX = direction === "vertical" || direction === "diagonal";
	let fixedY = direction === "horizontal" || direction === "diagonal";
	if (!fixedX) {
		const aligned = align(result, "x", corners, context.tolerance);
		fixedX = aligned !== result;
		result = aligned;
	}
	if (!fixedY) {
		const aligned = align(result, "y", corners, context.tolerance);
		fixedY = aligned !== result;
		result = aligned;
	}

	// The grid rounds whichever axes nothing else has fixed.
	const { grid } = context;
	if (grid && !(fixedX && fixedY)) {
		const p = result.point;
		const gridded = {
			x: fixedX ? p.x : Math.round(p.x / grid) * grid,
			y: fixedY ? p.y : Math.round(p.y / grid) * grid,
		};
		return {
			point: gridded,
			kind: result.kind === "none" ? "grid" : result.kind,
			guides: result.guides.map(([from]) => [from, gridded] as const),
		};
	}
	return result;
}

const ANGLE_STEP = Math.PI / 4;
const ANGLE_TOLERANCE = (6 * Math.PI) / 180;

/** If the line from `from` is within a few degrees of a multiple of 45°, the point that makes it exact. */
function straighten(
	point: Point,
	from: Point,
):
	| { point: Point; direction: "horizontal" | "vertical" | "diagonal" }
	| undefined {
	const angle = Math.atan2(point.y - from.y, point.x - from.x);
	const steps = Math.round(angle / ANGLE_STEP);
	const snapped = steps * ANGLE_STEP;
	if (Math.abs(angle - snapped) > ANGLE_TOLERANCE) return undefined;
	const length = distance(point, from);
	const direction =
		steps % 2 !== 0 ? "diagonal" : steps % 4 === 0 ? "horizontal" : "vertical";
	// Exact values for straight lines, so floating-point noise never leaves them slightly off.
	const x =
		direction === "vertical" ? from.x : from.x + Math.cos(snapped) * length;
	const y =
		direction === "horizontal" ? from.y : from.y + Math.sin(snapped) * length;
	return { point: { x, y }, direction };
}

/** Moves the snap onto the same x (or y) as the best-aligned corner in range, adding a guide from it. */
function align(
	snapped: Snap,
	axis: "x" | "y",
	corners: readonly Point[],
	tolerance: number,
): Snap {
	const p = snapped.point;
	let best: Point | undefined;
	for (const corner of corners) {
		const offset = Math.abs(corner[axis] - p[axis]);
		if (offset > tolerance) continue;
		const bestOffset = best
			? Math.abs(best[axis] - p[axis])
			: Number.POSITIVE_INFINITY;
		if (
			offset < bestOffset ||
			(offset === bestOffset && best && distance(corner, p) < distance(best, p))
		) {
			best = corner;
		}
	}
	if (!best) return snapped;
	const point = { ...p, [axis]: best[axis] };
	return {
		point,
		kind: "align",
		guides: [
			...snapped.guides.map(([from]) => [from, point] as const),
			[best, point],
		],
	};
}

/** The candidate nearest to point, if any is within tolerance. */
function closest(
	point: Point,
	candidates: readonly Point[],
	tolerance: number,
): Point | undefined {
	let best: Point | undefined;
	let bestDistance = tolerance;
	for (const candidate of candidates) {
		const d = distance(point, candidate);
		if (d <= bestDistance) {
			best = candidate;
			bestDistance = d;
		}
	}
	return best;
}

function* edges(
	outline: Polygon,
): Generator<{ a: Point; b: Point; from: number; to: number }> {
	for (let from = 0; from < outline.length; from++) {
		const to = (from + 1) % outline.length;
		yield { a: outline[from] as Point, b: outline[to] as Point, from, to };
	}
}

function nearestOnSegment(p: Point, a: Point, b: Point): Point {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return a;
	const t = Math.max(
		0,
		Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared),
	);
	return { x: a.x + t * dx, y: a.y + t * dy };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
