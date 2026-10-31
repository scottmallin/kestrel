import type { Point, Polygon } from "./index.ts";

/**
 * Where an Underlay sits on its Building's plane (ADR 0008): `plane = rotate(pixel × scale) + (x, y)`.
 * Rotation is in radians, clockwise on screen (y points down), matching Konva.
 */
export type Placement = {
	/** Metres per image pixel. */
	readonly scale: number;
	readonly rotation: number;
	readonly x: number;
	readonly y: number;
};

/** Where an Underlay sits until its scale is set or it's aligned: 20 pixels per metre, at the origin. */
export const DEFAULT_PLACEMENT: Placement = {
	scale: 1 / 20,
	rotation: 0,
	x: 0,
	y: 0,
};

/** A point on the image (pixels) to the plane (metres). */
export function toPlane(placement: Placement, pixel: Point): Point {
	const { scale, rotation, x, y } = placement;
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const px = pixel.x * scale;
	const py = pixel.y * scale;
	return { x: px * cos - py * sin + x, y: px * sin + py * cos + y };
}

/** A point on the plane (metres) to the image (pixels). */
export function toImage(placement: Placement, point: Point): Point {
	const { scale, rotation, x, y } = placement;
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const dx = point.x - x;
	const dy = point.y - y;
	return {
		x: (dx * cos + dy * sin) / scale,
		y: (-dx * sin + dy * cos) / scale,
	};
}

/**
 * The Placement that puts two points on the image exactly onto two points on the plane (Alignment),
 * or null if either pair is a single point.
 */
export function placementFromPairs(
	image: readonly [Point, Point],
	plane: readonly [Point, Point],
): Placement | null {
	const [i0, i1] = image;
	const [p0, p1] = plane;
	const imageLength = Math.hypot(i1.x - i0.x, i1.y - i0.y);
	const planeLength = Math.hypot(p1.x - p0.x, p1.y - p0.y);
	if (imageLength === 0 || planeLength === 0) return null;
	const scale = planeLength / imageLength;
	const rotation =
		Math.atan2(p1.y - p0.y, p1.x - p0.x) - Math.atan2(i1.y - i0.y, i1.x - i0.x);
	const unshifted = toPlane({ scale, rotation, x: 0, y: 0 }, i0);
	return { scale, rotation, x: p0.x - unshifted.x, y: p0.y - unshifted.y };
}

/**
 * Alignment for a plan whose own scale is already set: turns and moves it so the first image point lands on
 * the first plane point and the line between them points the same way, keeping `scale`. `mismatch` says how
 * much longer (positive) or shorter the line is on the plane than on the plan at that scale, so a mis-click or
 * a wrong scale can be caught. Null if either pair is a single point.
 */
export function alignAtScale(
	image: readonly [Point, Point],
	plane: readonly [Point, Point],
	scale: number,
): { placement: Placement; mismatch: number } | null {
	const free = placementFromPairs(image, plane);
	if (!free) return null;
	const rotation = free.rotation;
	const unshifted = toPlane({ scale, rotation, x: 0, y: 0 }, image[0]);
	return {
		placement: {
			scale,
			rotation,
			x: plane[0].x - unshifted.x,
			y: plane[0].y - unshifted.y,
		},
		mismatch: free.scale / scale - 1,
	};
}

/** How much to scale the plane so the line from a to b is `metres` long, or null if that's impossible. */
export function rescaleFactor(
	a: Point,
	b: Point,
	metres: number,
): number | null {
	const length = Math.hypot(b.x - a.x, b.y - a.y);
	if (length === 0 || !(metres > 0) || !Number.isFinite(metres)) return null;
	return metres / length;
}

/** The Placement after scaling the whole plane about its origin. */
export const scalePlacement = (
	placement: Placement,
	factor: number,
): Placement => ({
	scale: placement.scale * factor,
	rotation: placement.rotation,
	x: placement.x * factor,
	y: placement.y * factor,
});

/** An outline after scaling the whole plane about its origin. */
export const scalePolygon = (outline: Polygon, factor: number): Polygon =>
	outline.map((p) => ({ x: p.x * factor, y: p.y * factor }));
