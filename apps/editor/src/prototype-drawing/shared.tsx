// PROTOTYPE – throwaway. Shared helpers for the drawing-tools variants.
// World coordinates are Underlay pixels; PX_PER_M is a fake scale for display only.
import { polygonArea } from "@kestrel/geometry";
import type Konva from "konva";
import polygonClipping, { type Polygon as PcPolygon } from "polygon-clipping";
import { useEffect, useRef, useState } from "react";
import {
	Circle,
	Group,
	Image as KImage,
	Layer,
	Line,
	Rect,
	Text,
} from "react-konva";

export type Pt = { x: number; y: number };
export type ProtoSpace = { id: string; points: Pt[] };

export const PX_PER_M = 20;
export const SNAP_PX = 10; // screen pixels

export type VariantProps = {
	spaces: ProtoSpace[];
	commit: (next: ProtoSpace[], label: string) => void;
	underlay: HTMLImageElement | null;
	underlayOpacity: number;
	grid: number | null;
	overlaps: Pt[][];
	width: number;
	height: number;
	setDebug: (debug: Record<string, unknown>) => void;
	setHint: (hint: string) => void;
};

let nextId = 1;
export const newId = () => `S${nextId++}`;

// ---------- geometry ----------

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function nearestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	if (len2 === 0) return a;
	const t = Math.max(
		0,
		Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
	);
	return { x: a.x + t * dx, y: a.y + t * dy };
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i]!;
		const b = poly[j]!;
		if (
			a.y > p.y !== b.y > p.y &&
			p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
		)
			inside = !inside;
	}
	return inside;
}

export const areaM2 = (points: Pt[]) =>
	polygonArea(points) / (PX_PER_M * PX_PER_M);

const toPc = (points: Pt[]): PcPolygon => [
	points.map((p) => [p.x, p.y] as [number, number]),
];
const fromPcRing = (ring: [number, number][]): Pt[] =>
	ring.slice(0, -1).map(([x, y]) => ({ x, y }));

export function findOverlaps(spaces: ProtoSpace[]): Pt[][] {
	const result: Pt[][] = [];
	for (let i = 0; i < spaces.length; i++) {
		for (let j = i + 1; j < spaces.length; j++) {
			const a = spaces[i]!;
			const b = spaces[j]!;
			for (const poly of polygonClipping.intersection(
				toPc(a.points),
				toPc(b.points),
			)) {
				const ring = fromPcRing(poly[0] as [number, number][]);
				if (areaM2(ring) > 0.05) result.push(ring);
			}
		}
	}
	return result;
}

/** Union of polygons; null if they don't form one connected shape. */
export function mergePolygons(polys: Pt[][]): Pt[] | null {
	const [first, ...rest] = polys.map(toPc);
	if (!first) return null;
	const result = polygonClipping.union(first, ...rest);
	if (result.length !== 1) return null;
	return fromPcRing(result[0]![0] as [number, number][]);
}

/** Cut a polygon with an infinite line through a and b. */
export function splitPolygon(points: Pt[], a: Pt, b: Pt): Pt[][] | null {
	const d = { x: b.x - a.x, y: b.y - a.y };
	const len = Math.hypot(d.x, d.y);
	if (len < 1) return null;
	const BIG = 1e6;
	const u = { x: (d.x / len) * BIG, y: (d.y / len) * BIG };
	const n = { x: -u.y, y: u.x };
	const half = (s: number): Pt[] => [
		{ x: a.x - u.x, y: a.y - u.y },
		{ x: a.x + u.x, y: a.y + u.y },
		{ x: a.x + u.x + s * n.x, y: a.y + u.y + s * n.y },
		{ x: a.x - u.x + s * n.x, y: a.y - u.y + s * n.y },
	];
	const pieces = [1, -1].flatMap((s) =>
		polygonClipping
			.intersection(toPc(points), toPc(half(s)))
			.map((p) => fromPcRing(p[0] as [number, number][])),
	);
	return pieces.length >= 2 ? pieces : null;
}

// ---------- snapping ----------

export type SnapKind =
	| "close"
	| "vertex"
	| "edge"
	| "angle"
	| "align"
	| "grid"
	| "none";
export type Snap = { point: Pt; kind: SnapKind; guides: [Pt, Pt][] };

export type SnapOptions = {
	spaces: ProtoSpace[];
	tolerance: number; // world units
	from?: Pt | undefined;
	closeTo?: Pt | undefined;
	extraVertices?: Pt[];
	grid: number | null;
	/** Skip this vertex (and its edges) – used while dragging it. */
	exclude?: { spaceId: string; index: number } | undefined;
};

export function snap(p: Pt, o: SnapOptions): Snap {
	if (o.closeTo && dist(p, o.closeTo) < o.tolerance * 1.5)
		return { point: o.closeTo, kind: "close", guides: [] };

	const vertices: Pt[] = [...(o.extraVertices ?? [])];
	const edges: [Pt, Pt][] = [];
	for (const s of o.spaces) {
		s.points.forEach((v, i) => {
			const isExcluded = o.exclude?.spaceId === s.id && o.exclude.index === i;
			if (!isExcluded) vertices.push(v);
			const j = (i + 1) % s.points.length;
			const touchesExcluded =
				o.exclude?.spaceId === s.id &&
				(o.exclude.index === i || o.exclude.index === j);
			if (!touchesExcluded) edges.push([v, s.points[j]!]);
		});
	}

	let best: Pt | null = null;
	let bestD = o.tolerance;
	for (const v of vertices) {
		const d = dist(p, v);
		if (d < bestD) {
			best = v;
			bestD = d;
		}
	}
	if (best) return { point: best, kind: "vertex", guides: [] };

	for (const [a, b] of edges) {
		const q = nearestOnSegment(p, a, b);
		const d = dist(p, q);
		if (d < bestD) {
			best = q;
			bestD = d;
		}
	}
	if (best) return { point: best, kind: "edge", guides: [] };

	let point = { ...p };
	let kind: SnapKind = "none";
	const guides: [Pt, Pt][] = [];
	let lockX = false;
	let lockY = false;

	if (o.from) {
		const angle = Math.atan2(p.y - o.from.y, p.x - o.from.x);
		const step = Math.PI / 4;
		const snapped = Math.round(angle / step) * step;
		if (Math.abs(angle - snapped) < (6 * Math.PI) / 180) {
			const r = dist(p, o.from);
			point = {
				x: o.from.x + Math.cos(snapped) * r,
				y: o.from.y + Math.sin(snapped) * r,
			};
			kind = "angle";
			const deg = Math.round((snapped * 180) / Math.PI);
			if (deg === 0 || Math.abs(deg) === 180) lockY = true;
			else if (Math.abs(deg) === 90) lockX = true;
			else lockX = lockY = true;
		}
	}

	if (!lockX) {
		const v = vertices.find((v) => Math.abs(v.x - point.x) < o.tolerance);
		if (v) {
			point.x = v.x;
			guides.push([v, point]);
			kind = "align";
		}
	}
	if (!lockY) {
		const v = vertices.find((v) => Math.abs(v.y - point.y) < o.tolerance);
		if (v) {
			point.y = v.y;
			guides.push([v, point]);
			kind = "align";
		}
	}

	if (kind === "none" && o.grid) {
		point = {
			x: Math.round(point.x / o.grid) * o.grid,
			y: Math.round(point.y / o.grid) * o.grid,
		};
		kind = "grid";
	}
	return { point, kind, guides };
}

// ---------- viewport ----------

/** Wheel zoom around the cursor; hold Space (or middle mouse) and drag to pan. */
export function useViewport(
	width: number,
	height: number,
	underlay: HTMLImageElement | null,
) {
	const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
	const [panning, setPanning] = useState(false);

	useEffect(() => {
		if (!underlay) return;
		const scale =
			Math.min(width / underlay.width, height / underlay.height) * 0.9;
		setView({
			scale,
			x: (width - underlay.width * scale) / 2,
			y: (height - underlay.height * scale) / 2,
		});
	}, [underlay, width, height]);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.code === "Space" && !(e.target as HTMLElement).closest("input")) {
				e.preventDefault();
				setPanning(true);
			}
		};
		const up = (e: KeyboardEvent) => e.code === "Space" && setPanning(false);
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, []);

	const stageProps = {
		width,
		height,
		scaleX: view.scale,
		scaleY: view.scale,
		x: view.x,
		y: view.y,
		draggable: panning,
		style: { cursor: panning ? "grab" : "crosshair" },
		onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
			if (e.target === e.target.getStage())
				setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
		},
		onWheel: (e: Konva.KonvaEventObject<WheelEvent>) => {
			e.evt.preventDefault();
			const stage = e.target.getStage();
			const pointer = stage?.getPointerPosition();
			if (!pointer) return;
			const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
			setView((v) => {
				const scale = Math.max(0.1, Math.min(20, v.scale * factor));
				const wx = (pointer.x - v.x) / v.scale;
				const wy = (pointer.y - v.y) / v.scale;
				return { scale, x: pointer.x - wx * scale, y: pointer.y - wy * scale };
			});
		},
	};
	return { view, panning, stageProps, tolerance: SNAP_PX / view.scale };
}

export function worldPointer(stage: Konva.Stage | null): Pt | null {
	return stage?.getRelativePointerPosition() ?? null;
}

// ---------- layers ----------

export function UnderlayLayer({
	underlay,
	opacity,
}: {
	underlay: HTMLImageElement | null;
	opacity: number;
}) {
	return (
		<Layer listening={false}>
			{underlay && <KImage image={underlay} opacity={opacity} />}
		</Layer>
	);
}

type SpacesLayerProps = {
	spaces: ProtoSpace[];
	selected?: string[];
	overlaps: Pt[][];
	scale: number;
	onSpaceMouseDown?: (
		id: string,
		e: Konva.KonvaEventObject<MouseEvent>,
	) => void;
};

export function SpacesLayer({
	spaces,
	selected = [],
	overlaps,
	scale,
	onSpaceMouseDown,
}: SpacesLayerProps) {
	return (
		<Layer>
			{spaces.map((s) => {
				const isSelected = selected.includes(s.id);
				const xs = s.points.map((p) => p.x);
				const ys = s.points.map((p) => p.y);
				const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
				const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
				return (
					<Group key={s.id}>
						<Line
							points={s.points.flatMap((p) => [p.x, p.y])}
							closed
							fill={
								isSelected ? "rgba(59,111,216,0.35)" : "rgba(59,111,216,0.18)"
							}
							stroke={isSelected ? "#1d4fc4" : "#3b6fd8"}
							strokeWidth={(isSelected ? 3 : 2) / scale}
							onMouseDown={(e) => onSpaceMouseDown?.(s.id, e)}
						/>
						<Text
							x={cx}
							y={cy}
							text={`${s.id}\n${areaM2(s.points).toFixed(1)} m²`}
							fontSize={12 / scale}
							fill="#1d3b78"
							align="center"
							offsetX={20 / scale}
							offsetY={8 / scale}
							listening={false}
						/>
					</Group>
				);
			})}
			{overlaps.map((ring, i) => (
				<Line
					// biome-ignore lint/suspicious/noArrayIndexKey: prototype
					key={i}
					points={ring.flatMap((p) => [p.x, p.y])}
					closed
					fill="rgba(220,38,38,0.45)"
					stroke="#dc2626"
					strokeWidth={2 / scale}
					dash={[6 / scale, 4 / scale]}
					listening={false}
				/>
			))}
		</Layer>
	);
}

const SNAP_COLOURS: Record<SnapKind, string> = {
	close: "#16a34a",
	vertex: "#ea580c",
	edge: "#ea580c",
	angle: "#7c3aed",
	align: "#db2777",
	grid: "#64748b",
	none: "#94a3b8",
};

export function SnapIndicator({
	snap: s,
	scale,
}: {
	snap: Snap | null;
	scale: number;
}) {
	if (!s) return null;
	const colour = SNAP_COLOURS[s.kind];
	return (
		<Group listening={false}>
			{s.guides.map(([a, b], i) => (
				<Line
					// biome-ignore lint/suspicious/noArrayIndexKey: prototype
					key={i}
					points={[a.x, a.y, b.x, b.y]}
					stroke={colour}
					strokeWidth={1 / scale}
					dash={[4 / scale, 4 / scale]}
				/>
			))}
			{s.kind === "close" ? (
				<Circle
					x={s.point.x}
					y={s.point.y}
					radius={10 / scale}
					stroke={colour}
					strokeWidth={3 / scale}
				/>
			) : s.kind === "vertex" ? (
				<Rect
					x={s.point.x - 6 / scale}
					y={s.point.y - 6 / scale}
					width={12 / scale}
					height={12 / scale}
					stroke={colour}
					strokeWidth={2 / scale}
				/>
			) : (
				<Circle x={s.point.x} y={s.point.y} radius={4 / scale} fill={colour} />
			)}
			{s.kind !== "none" && (
				<Text
					x={s.point.x + 10 / scale}
					y={s.point.y + 10 / scale}
					text={s.kind}
					fontSize={11 / scale}
					fill={colour}
				/>
			)}
		</Group>
	);
}

/** Draggable corner handles for one Space, snapping as they move; commits on release. */
export function VertexHandles({
	space,
	spaces,
	commit,
	grid,
	scale,
	tolerance,
	onSnap,
}: {
	space: ProtoSpace;
	spaces: ProtoSpace[];
	commit: VariantProps["commit"];
	grid: number | null;
	scale: number;
	tolerance: number;
	onSnap: (s: Snap | null) => void;
}) {
	const [draft, setDraft] = useState<Pt[] | null>(null);
	const points = draft ?? space.points;
	const pointsRef = useRef(points);
	pointsRef.current = points;

	return (
		<Group>
			<Line
				points={points.flatMap((p) => [p.x, p.y])}
				closed
				stroke="#1d4fc4"
				strokeWidth={2 / scale}
				listening={false}
			/>
			{points.map((p, i) => (
				<Circle
					// biome-ignore lint/suspicious/noArrayIndexKey: vertex order is identity here
					key={i}
					x={p.x}
					y={p.y}
					radius={6 / scale}
					fill="#fff"
					stroke="#1d4fc4"
					strokeWidth={2 / scale}
					draggable
					onDragMove={(e) => {
						const s = snap(
							{ x: e.target.x(), y: e.target.y() },
							{
								spaces,
								tolerance,
								grid,
								exclude: { spaceId: space.id, index: i },
							},
						);
						e.target.position(s.point);
						onSnap(s);
						setDraft(pointsRef.current.map((q, k) => (k === i ? s.point : q)));
					}}
					onDragEnd={() => {
						const next = pointsRef.current;
						setDraft(null);
						onSnap(null);
						commit(
							spaces.map((sp) =>
								sp.id === space.id ? { ...sp, points: next } : sp,
							),
							`move corner of ${space.id}`,
						);
					}}
				/>
			))}
		</Group>
	);
}

// ---------- sample underlay ----------

/** A fake shopping-centre plan: dark walls, door gaps, grey labels. */
export function makeSampleUnderlay(): Promise<HTMLImageElement> {
	const W = 1200;
	const H = 800;
	const c = document.createElement("canvas");
	c.width = W;
	c.height = H;
	const g = c.getContext("2d")!;
	g.fillStyle = "#fff";
	g.fillRect(0, 0, W, H);
	g.strokeStyle = "#111";
	g.lineWidth = 4;
	const rect = (x: number, y: number, w: number, h: number) =>
		g.strokeRect(x, y, w, h);
	const door = (x: number, y: number, w: number, h: number) => {
		g.fillStyle = "#fff";
		g.fillRect(x, y, w, h);
	};
	const label = (text: string, x: number, y: number) => {
		g.fillStyle = "#999";
		g.font = "16px sans-serif";
		g.textAlign = "center";
		g.fillText(text, x, y);
	};

	rect(40, 40, 1120, 720);
	// top row of units
	const topW = 1120 / 5;
	for (let i = 0; i < 5; i++) {
		const x = 40 + i * topW;
		rect(x, 40, topW, 320);
		door(x + topW / 2 - 18, 356, 36, 8);
		label(`Unit ${i + 1}`, x + topW / 2, 200);
	}
	// bottom row: three units, one L-shaped anchor store, toilets
	const xs = [40, 264, 488];
	xs.forEach((x, i) => {
		rect(x, 440, 224, 320);
		door(x + 94, 436, 36, 8);
		label(`Unit ${i + 6}`, x + 112, 600);
	});
	g.beginPath();
	g.moveTo(712, 440);
	g.lineTo(1040, 440);
	g.lineTo(1040, 600);
	g.lineTo(1160, 600);
	g.lineTo(1160, 760);
	g.lineTo(712, 760);
	g.closePath();
	g.stroke();
	door(840, 436, 60, 8);
	label("Anchor store", 880, 640);
	rect(1040, 440, 120, 160);
	door(1036, 500, 8, 30);
	label("WC", 1100, 525);
	// mall entrances
	door(36, 380, 8, 40);
	door(1156, 380, 8, 40);
	label("Mall corridor", 600, 405);

	return loadImage(c.toDataURL());
}

const MAX_UNDERLAY = 2000;

/** Loads an image, downscaling big uploads so fill and snapping stay fast. */
export async function loadImage(src: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.src = src;
	await img.decode();
	const ratio = Math.min(1, MAX_UNDERLAY / Math.max(img.width, img.height));
	if (ratio === 1) return img;
	const c = document.createElement("canvas");
	c.width = Math.round(img.width * ratio);
	c.height = Math.round(img.height * ratio);
	c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
	return loadImage(c.toDataURL());
}
