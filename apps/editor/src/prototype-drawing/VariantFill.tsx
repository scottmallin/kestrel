// PROTOTYPE – Variant C: click inside a room on the Underlay and the room is detected from the image.
// Classic image processing, no AI: wall mask → close door gaps → flood fill → outline → simplify → square up.
import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Layer, Line, Stage } from "react-konva";
import {
	newId,
	type ProtoSpace,
	type Pt,
	pointInPolygon,
	type Snap,
	SnapIndicator,
	SpacesLayer,
	UnderlayLayer,
	useViewport,
	type VariantProps,
	VertexHandles,
	worldPointer,
} from "./shared.tsx";

export const name = "Magic fill – click inside a room";

export function VariantFill(props: VariantProps) {
	const { spaces, commit, underlay, grid, width, height } = props;
	const stageRef = useRef<Konva.Stage>(null);
	const { view, panning, stageProps, tolerance } = useViewport(
		width,
		height,
		underlay,
	);
	const [gap, setGap] = useState(40);
	const [threshold, setThreshold] = useState(110);
	const [proposal, setProposal] = useState<Pt[] | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [hover, setHover] = useState<Snap | null>(null);
	const [message, setMessage] = useState("");
	const [lastFill, setLastFill] = useState<Record<string, unknown>>({});

	const accept = () => {
		if (!proposal) return;
		const id = newId();
		commit([...spaces, { id, points: proposal }], `fill ${id}`);
		setProposal(null);
		setSelected(id);
	};

	useEffect(() => {
		props.setHint(
			proposal
				? "Enter or click inside the orange shape to accept · Esc to reject · click elsewhere to try another spot"
				: "Click inside a room on the plan · raise “door gap” if the fill leaks through doorways · click a Space to select and drag its corners",
		);
		props.setDebug({
			tool: "fill",
			proposal: proposal?.length ?? null,
			selected,
			...lastFill,
		});
	});

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Enter") accept();
			if (e.key === "Escape") {
				setProposal(null);
				setSelected(null);
			}
			if ((e.key === "Delete" || e.key === "Backspace") && selected) {
				commit(
					spaces.filter((s) => s.id !== selected),
					`delete ${selected}`,
				);
				setSelected(null);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	const onClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
		if (panning || e.evt.button !== 0 || !underlay) return;
		const p = worldPointer(stageRef.current);
		if (!p) return;
		if (proposal && pointInPolygon(p, proposal)) return accept();
		const existing = [...spaces]
			.reverse()
			.find((s) => pointInPolygon(p, s.points));
		if (existing) {
			setProposal(null);
			setSelected(existing.id);
			return;
		}
		setSelected(null);
		const started = performance.now();
		const result = detectRoom(underlay, spaces, p, gap, threshold);
		setLastFill({
			fillMs: Math.round(performance.now() - started),
			...result.stats,
		});
		setMessage(result.error ?? "");
		setProposal(result.points ?? null);
	};

	const selectedSpace = spaces.find((s) => s.id === selected);

	return (
		<>
			<div style={toolbarStyle}>
				<label>
					Door gap {gap}px{" "}
					<input
						type="range"
						min={0}
						max={80}
						value={gap}
						onChange={(e) => setGap(Number(e.target.value))}
					/>
				</label>
				<label>
					Wall darkness {threshold}{" "}
					<input
						type="range"
						min={40}
						max={220}
						value={threshold}
						onChange={(e) => setThreshold(Number(e.target.value))}
					/>
				</label>
				{message && <span style={{ color: "#b91c1c" }}>{message}</span>}
			</div>
			<Stage ref={stageRef} {...stageProps} onClick={onClick}>
				<UnderlayLayer underlay={underlay} opacity={props.underlayOpacity} />
				<SpacesLayer
					spaces={spaces}
					selected={selected ? [selected] : []}
					overlaps={props.overlaps}
					scale={view.scale}
				/>
				<Layer>
					{proposal && (
						<Line
							points={proposal.flatMap((p) => [p.x, p.y])}
							closed
							stroke="#ea580c"
							strokeWidth={2 / view.scale}
							fill="rgba(234,88,12,0.25)"
							dash={[8 / view.scale, 4 / view.scale]}
						/>
					)}
					{selectedSpace && (
						<VertexHandles
							space={selectedSpace}
							spaces={spaces}
							commit={commit}
							grid={grid}
							scale={view.scale}
							tolerance={tolerance}
							onSnap={setHover}
						/>
					)}
					<SnapIndicator snap={hover} scale={view.scale} />
				</Layer>
			</Stage>
		</>
	);
}

// ---------- room detection ----------

type Detection = {
	points?: Pt[];
	error?: string;
	stats: Record<string, unknown>;
};

function detectRoom(
	img: HTMLImageElement,
	spaces: ProtoSpace[],
	seed: Pt,
	gap: number,
	threshold: number,
): Detection {
	const w = img.width;
	const h = img.height;
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const g = canvas.getContext("2d", { willReadFrequently: true })!;
	g.drawImage(img, 0, 0);
	// Existing Spaces count as walls, so fills stop at them.
	g.fillStyle = "#000";
	for (const s of spaces) {
		g.beginPath();
		for (const [i, p] of s.points.entries()) {
			if (i) g.lineTo(p.x, p.y);
			else g.moveTo(p.x, p.y);
		}
		g.closePath();
		g.fill();
	}
	const { data } = g.getImageData(0, 0, w, h);

	const wall = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) {
		const lum =
			0.299 * data[i * 4]! +
			0.587 * data[i * 4 + 1]! +
			0.114 * data[i * 4 + 2]!;
		wall[i] = lum < threshold ? 1 : 0;
	}
	const radius = Math.round(gap / 2);
	const blocked = radius > 0 ? dilate(wall, w, h, radius) : wall;

	const sx = Math.round(seed.x);
	const sy = Math.round(seed.y);
	if (sx < 0 || sy < 0 || sx >= w || sy >= h)
		return { error: "Click inside the plan.", stats: {} };
	if (blocked[sy * w + sx])
		return {
			error: "That spot is on a wall – click further inside the room.",
			stats: {},
		};

	const region = new Uint8Array(w * h);
	const queue = new Int32Array(w * h);
	let head = 0;
	let tail = 0;
	queue[tail++] = sy * w + sx;
	region[sy * w + sx] = 1;
	while (head < tail) {
		const i = queue[head++]!;
		const x = i % w;
		for (const j of [i - 1, i + 1, i - w, i + w]) {
			if (j < 0 || j >= w * h) continue;
			if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
			if (!region[j] && !blocked[j]) {
				region[j] = 1;
				queue[tail++] = j;
			}
		}
	}
	const filled = tail;
	if (filled > w * h * 0.4) {
		return {
			error:
				"The fill leaked outside the room – raise the door gap or draw this one by hand.",
			stats: { filled },
		};
	}

	// Grow back out to the walls we shrank away from, without crossing them.
	let grown: Uint8Array = region;
	if (radius > 0) {
		grown = dilate(region, w, h, radius);
		for (let i = 0; i < w * h; i++) if (wall[i]) grown[i] = 0;
	}

	const outline = traceOutline(grown, w, h);
	if (outline.length < 3)
		return { error: "Couldn't find a room there.", stats: { filled } };
	const simple = simplify(outline, 2);
	const squared = squareUp(simple, 10);
	return {
		points: squared,
		stats: { filled, rawPoints: outline.length, simplified: squared.length },
	};
}

/** Box dilation (separable max filter). */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
	const tmp = new Uint8Array(w * h);
	const out = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		let count = 0;
		for (let x = -r; x < w; x++) {
			const add = x + r;
			if (add < w && mask[y * w + add]) count++;
			const drop = x - r - 1;
			if (drop >= 0 && mask[y * w + drop]) count--;
			if (x >= 0) tmp[y * w + x] = count > 0 ? 1 : 0;
		}
	}
	for (let x = 0; x < w; x++) {
		let count = 0;
		for (let y = -r; y < h; y++) {
			const add = y + r;
			if (add < h && tmp[add * w + x]) count++;
			const drop = y - r - 1;
			if (drop >= 0 && tmp[drop * w + x]) count--;
			if (y >= 0) out[y * w + x] = count > 0 ? 1 : 0;
		}
	}
	return out;
}

/** Walks the pixel-edge boundary of the mask and returns its longest closed loop. */
function traceOutline(mask: Uint8Array, w: number, h: number): Pt[] {
	const at = (x: number, y: number) =>
		x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0;
	const next = new Map<number, number[]>();
	const key = (x: number, y: number) => y * (w + 1) + x;
	const add = (x0: number, y0: number, x1: number, y1: number) => {
		const k = key(x0, y0);
		const list = next.get(k);
		if (list) list.push(key(x1, y1));
		else next.set(k, [key(x1, y1)]);
	};
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (!at(x, y)) continue;
			// Clockwise around each filled pixel, only on sides facing empty pixels.
			if (!at(x, y - 1)) add(x, y, x + 1, y);
			if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
			if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
			if (!at(x - 1, y)) add(x, y + 1, x, y);
		}
	}
	let best: Pt[] = [];
	while (next.size) {
		const [start] = next.keys();
		const loop: Pt[] = [];
		let k = start!;
		while (true) {
			const list = next.get(k);
			if (!list?.length) break;
			const n = list.pop()!;
			if (!list.length) next.delete(k);
			loop.push({ x: k % (w + 1), y: Math.floor(k / (w + 1)) });
			k = n;
			if (k === start) break;
		}
		if (loop.length > best.length) best = loop;
	}
	return best;
}

/** Ramer–Douglas–Peucker on a closed ring. */
function simplify(ring: Pt[], epsilon: number): Pt[] {
	const rdp = (pts: Pt[]): Pt[] => {
		if (pts.length < 3) return pts;
		const a = pts[0]!;
		const b = pts.at(-1)!;
		let maxD = 0;
		let index = 0;
		const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		for (let i = 1; i < pts.length - 1; i++) {
			const p = pts[i]!;
			const d =
				Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
			if (d > maxD) {
				maxD = d;
				index = i;
			}
		}
		if (maxD <= epsilon) return [a, b];
		return [
			...rdp(pts.slice(0, index + 1)).slice(0, -1),
			...rdp(pts.slice(index)),
		];
	};
	// Split the ring at its farthest point from the start so RDP has two real ends.
	const first = ring[0]!;
	let far = 0;
	ring.forEach((p, i) => {
		if (
			Math.hypot(p.x - first.x, p.y - first.y) >
			Math.hypot(ring[far]!.x - first.x, ring[far]!.y - first.y)
		)
			far = i;
	});
	const left = rdp(ring.slice(0, far + 1));
	const right = rdp([...ring.slice(far), first]);
	return [...left.slice(0, -1), ...right.slice(0, -1)];
}

/** Make near-horizontal and near-vertical edges exactly straight. */
function squareUp(ring: Pt[], maxDegrees: number): Pt[] {
	const out = ring.map((p) => ({ ...p }));
	const tol = Math.tan((maxDegrees * Math.PI) / 180);
	for (let i = 0; i < out.length; i++) {
		const a = out[i]!;
		const b = out[(i + 1) % out.length]!;
		const dx = Math.abs(b.x - a.x);
		const dy = Math.abs(b.y - a.y);
		if (dy <= dx * tol) a.y = b.y = (a.y + b.y) / 2;
		else if (dx <= dy * tol) a.x = b.x = (a.x + b.x) / 2;
	}
	// Drop points that ended up in a straight line.
	return out.filter((p, i) => {
		const prev = out[(i - 1 + out.length) % out.length]!;
		const nxt = out[(i + 1) % out.length]!;
		return (
			Math.abs(
				(p.x - prev.x) * (nxt.y - p.y) - (p.y - prev.y) * (nxt.x - p.x),
			) > 1e-6
		);
	});
}

const toolbarStyle = {
	position: "absolute",
	top: 12,
	left: 12,
	zIndex: 10,
	display: "flex",
	gap: 16,
	alignItems: "center",
	padding: "6px 10px",
	borderRadius: 6,
	background: "rgba(255,255,255,0.92)",
	border: "1px solid #cbd5e1",
	font: "13px system-ui, sans-serif",
} as const;
