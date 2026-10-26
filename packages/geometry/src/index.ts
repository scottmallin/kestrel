/** A point on a Building's local plane, in metres (see ADR 0001). */
export type Point = { readonly x: number; readonly y: number };

/** A closed outline; the last point connects back to the first. */
export type Polygon = readonly Point[];

/** Unsigned area of a simple polygon, via the shoelace formula. */
export function polygonArea(polygon: Polygon): number {
	let twiceArea = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i] as Point;
		const b = polygon[(i + 1) % polygon.length] as Point;
		twiceArea += a.x * b.y - b.x * a.y;
	}
	return Math.abs(twiceArea) / 2;
}

/** Whether p lies inside the outline (even-odd rule). */
export function containsPoint(outline: Polygon, p: Point): boolean {
	let inside = false;
	for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
		const a = outline[i] as Point;
		const b = outline[j] as Point;
		if (
			a.y > p.y !== b.y > p.y &&
			p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
		)
			inside = !inside;
	}
	return inside;
}

export * from "./boolean.ts";
export * from "./snap.ts";
export * from "./trace.ts";
