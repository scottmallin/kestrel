import type { Point, Polygon } from "./index.ts";

/** A floor plan reduced to pixels: walls[y * width + x] is 1 for wall, 0 for open floor. */
export type WallMask = {
	readonly width: number;
	readonly height: number;
	readonly walls: Uint8Array;
};

export type TraceResult =
	| { readonly ok: true; readonly outline: Polygon }
	| { readonly ok: false; readonly reason: string };

export type TraceOptions = {
	/** Openings in walls up to this many pixels wide are treated as closed, so the fill stays in the room. */
	readonly doorGap?: number;
	/** Outlines of Spaces already drawn; the fill treats them as walls. */
	readonly occupied?: readonly Polygon[];
};

/** Finds the room containing seed and returns its outline in pixel coordinates. */
export function traceRoom(
	mask: WallMask,
	seed: Point,
	options: TraceOptions = {},
): TraceResult {
	const x = Math.round(seed.x);
	const y = Math.round(seed.y);
	if (x < 0 || y < 0 || x >= mask.width || y >= mask.height)
		return { ok: false, reason: "Click inside the plan." };
	const { width, height } = mask;
	const occupied = options.occupied ?? [];
	if (occupied.some((outline) => contains(outline, seed))) {
		return { ok: false, reason: "That spot is already part of a Space." };
	}
	const walls = withOccupied(mask, occupied);
	if (walls[y * width + x]) {
		return {
			ok: false,
			reason: "That spot is on a wall. Click further inside the room.",
		};
	}
	// Thicken walls by half the door gap so doorways close, fill, then grow back out to the real walls.
	const radius = Math.round((options.doorGap ?? 0) / 2);
	const blocked = radius > 0 ? dilate(walls, width, height, radius) : walls;
	const start = nearestOpen(blocked, width, height, x, y, radius + 1);
	if (start === undefined)
		return { ok: false, reason: "Click further inside the room." };
	const { region, size } = floodFill(blocked, width, height, start);
	if (size > width * height * MAX_ROOM_SHARE) {
		return {
			ok: false,
			reason:
				"The fill leaked out of the room. Raise the door gap, or close the opening.",
		};
	}
	const room =
		radius > 0
			? dilate(region, width, height, radius).map((v, i) => (walls[i] ? 0 : v))
			: region;
	const outline = traceOutline(room, width, height);
	return {
		ok: true,
		outline: removeStraightCorners(
			squareUp(simplify(outline, SIMPLIFY_PIXELS), SQUARE_UP_DEGREES),
		),
	};
}

/** The mask's walls plus every pixel whose centre lies inside an occupied outline. */
function withOccupied(
	mask: WallMask,
	occupied: readonly Polygon[],
): Uint8Array {
	if (occupied.length === 0) return mask.walls;
	const walls = mask.walls.slice();
	for (const outline of occupied) {
		const xs = outline.map((p) => p.x);
		const ys = outline.map((p) => p.y);
		const x0 = Math.max(0, Math.floor(Math.min(...xs)));
		const x1 = Math.min(mask.width - 1, Math.ceil(Math.max(...xs)));
		const y0 = Math.max(0, Math.floor(Math.min(...ys)));
		const y1 = Math.min(mask.height - 1, Math.ceil(Math.max(...ys)));
		for (let y = y0; y <= y1; y++) {
			for (let x = x0; x <= x1; x++) {
				if (contains(outline, { x: x + 0.5, y: y + 0.5 }))
					walls[y * mask.width + x] = 1;
			}
		}
	}
	return walls;
}

/** Even-odd point-in-polygon test. */
function contains(outline: Polygon, p: Point): boolean {
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

/** Wiggles smaller than this (in pixels) are smoothed out of traced outlines. */
const SIMPLIFY_PIXELS = 1.5;
/** Edges within this many degrees of horizontal or vertical are made exactly so. */
const SQUARE_UP_DEGREES = 10;

/** A room covering more of the plan than this is assumed to be a leak. */
const MAX_ROOM_SHARE = 0.4;

/** The open pixel index nearest (x, y) within reach, searching outwards ring by ring. */
function nearestOpen(
	blocked: Uint8Array,
	width: number,
	height: number,
	x: number,
	y: number,
	reach: number,
) {
	for (let r = 0; r <= reach; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				const px = x + dx;
				const py = y + dy;
				if (
					px >= 0 &&
					py >= 0 &&
					px < width &&
					py < height &&
					!blocked[py * width + px]
				)
					return py * width + px;
			}
		}
	}
	return undefined;
}

function floodFill(
	blocked: Uint8Array,
	width: number,
	height: number,
	start: number,
) {
	const region = new Uint8Array(width * height);
	const queue = new Int32Array(width * height);
	let head = 0;
	let tail = 0;
	queue[tail++] = start;
	region[start] = 1;
	while (head < tail) {
		const i = queue[head++] as number;
		const x = i % width;
		const neighbours = [
			x > 0 ? i - 1 : -1,
			x < width - 1 ? i + 1 : -1,
			i - width,
			i + width,
		];
		for (const j of neighbours) {
			if (j < 0 || j >= width * height || region[j] || blocked[j]) continue;
			region[j] = 1;
			queue[tail++] = j;
		}
	}
	return { region, size: tail };
}

/** Grows the set pixels by radius in every direction (a square brush). */
function dilate(
	mask: Uint8Array,
	width: number,
	height: number,
	radius: number,
): Uint8Array {
	const rows = new Uint8Array(width * height);
	const out = new Uint8Array(width * height);
	// Sliding-window counts make each pass linear in the number of pixels.
	for (let y = 0; y < height; y++) {
		let count = 0;
		for (let x = -radius; x < width; x++) {
			if (x + radius < width && mask[y * width + x + radius]) count++;
			if (x - radius - 1 >= 0 && mask[y * width + x - radius - 1]) count--;
			if (x >= 0) rows[y * width + x] = count > 0 ? 1 : 0;
		}
	}
	for (let x = 0; x < width; x++) {
		let count = 0;
		for (let y = -radius; y < height; y++) {
			if (y + radius < height && rows[(y + radius) * width + x]) count++;
			if (y - radius - 1 >= 0 && rows[(y - radius - 1) * width + x]) count--;
			if (y >= 0) out[y * width + x] = count > 0 ? 1 : 0;
		}
	}
	return out;
}

/** Walks the pixel-edge boundary of the region and returns its longest closed loop. */
function traceOutline(
	region: Uint8Array,
	width: number,
	height: number,
): Point[] {
	const inside = (x: number, y: number) =>
		x >= 0 && y >= 0 && x < width && y < height && region[y * width + x] === 1;
	const key = (x: number, y: number) => y * (width + 1) + x;
	const next = new Map<number, number[]>();
	const link = (x0: number, y0: number, x1: number, y1: number) => {
		const from = key(x0, y0);
		next.set(from, [...(next.get(from) ?? []), key(x1, y1)]);
	};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (!inside(x, y)) continue;
			// Clockwise around each region pixel, only along sides that face outside it.
			if (!inside(x, y - 1)) link(x, y, x + 1, y);
			if (!inside(x + 1, y)) link(x + 1, y, x + 1, y + 1);
			if (!inside(x, y + 1)) link(x + 1, y + 1, x, y + 1);
			if (!inside(x - 1, y)) link(x, y + 1, x, y);
		}
	}
	let longest: Point[] = [];
	while (next.size > 0) {
		const [start] = next.keys() as MapIterator<number>;
		const loop: Point[] = [];
		let at = start as number;
		do {
			const targets = next.get(at);
			const to = targets?.pop();
			if (to === undefined) break;
			if (targets?.length === 0) next.delete(at);
			loop.push({ x: at % (width + 1), y: Math.floor(at / (width + 1)) });
			at = to;
		} while (at !== start);
		if (loop.length > longest.length) longest = loop;
	}
	return longest;
}

/** Drops corners that sit on a straight line between their neighbours. */
function removeStraightCorners(outline: readonly Point[]): Point[] {
	return outline.filter((p, i) => {
		const prev = outline[(i - 1 + outline.length) % outline.length] as Point;
		const next = outline[(i + 1) % outline.length] as Point;
		return (
			Math.abs(
				(p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x),
			) > 1e-9
		);
	});
}

/** Ramer–Douglas–Peucker simplification of a closed ring. */
function simplify(ring: readonly Point[], tolerance: number): Point[] {
	if (ring.length < 4) return [...ring];
	// Split at the corner farthest from the first, so each half has two fixed ends.
	const first = ring[0] as Point;
	let far = 0;
	ring.forEach((p, i) => {
		if (distance(p, first) > distance(ring[far] as Point, first)) far = i;
	});
	const there = simplifyPath(ring.slice(0, far + 1), tolerance);
	const back = simplifyPath([...ring.slice(far), first], tolerance);
	return [...there.slice(0, -1), ...back.slice(0, -1)];
}

function simplifyPath(path: readonly Point[], tolerance: number): Point[] {
	const a = path[0] as Point;
	const b = path.at(-1) as Point;
	let farthest = 0;
	let index = 0;
	for (let i = 1; i < path.length - 1; i++) {
		const d = distanceToLine(path[i] as Point, a, b);
		if (d > farthest) {
			farthest = d;
			index = i;
		}
	}
	if (farthest <= tolerance) return [a, b];
	return [
		...simplifyPath(path.slice(0, index + 1), tolerance).slice(0, -1),
		...simplifyPath(path.slice(index), tolerance),
	];
}

/** Makes near-horizontal and near-vertical edges exactly so, by averaging their ends. */
function squareUp(ring: readonly Point[], maxDegrees: number): Point[] {
	const out = ring.map((p): { x: number; y: number } => ({ ...p }));
	const slope = Math.tan((maxDegrees * Math.PI) / 180);
	out.forEach((a, i) => {
		const b = out[(i + 1) % out.length] as { x: number; y: number };
		const dx = Math.abs(b.x - a.x);
		const dy = Math.abs(b.y - a.y);
		if (dy <= dx * slope) a.y = b.y = (a.y + b.y) / 2;
		else if (dx <= dy * slope) a.x = b.x = (a.x + b.x) / 2;
	});
	return out;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function distanceToLine(p: Point, a: Point, b: Point): number {
	const length = distance(a, b);
	if (length === 0) return distance(p, a);
	return (
		Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length
	);
}
