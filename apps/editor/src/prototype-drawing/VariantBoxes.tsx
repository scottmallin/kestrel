// PROTOTYPE – Variant B: everything starts as a rectangle, then you reshape, split and merge.
import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Layer, Line, Rect, Stage } from "react-konva";
import {
	dist,
	mergePolygons,
	newId,
	type ProtoSpace,
	type Pt,
	pointInPolygon,
	type Snap,
	SnapIndicator,
	SpacesLayer,
	snap,
	splitPolygon,
	UnderlayLayer,
	useViewport,
	type VariantProps,
	VertexHandles,
	worldPointer,
} from "./shared.tsx";

export const name = "Boxes – drag, reshape, split, merge";

type Gesture =
	| { type: "box"; start: Pt; end: Pt }
	| { type: "move"; start: Pt; offset: Pt; ids: string[] }
	| { type: "split"; start: Pt; end: Pt };

export function VariantBoxes(props: VariantProps) {
	const { spaces, commit, underlay, grid, width, height } = props;
	const stageRef = useRef<Konva.Stage>(null);
	const { view, panning, stageProps, tolerance } = useViewport(
		width,
		height,
		underlay,
	);
	const [mode, setMode] = useState<"box" | "split">("box");
	const [selected, setSelected] = useState<string[]>([]);
	const [gesture, setGesture] = useState<Gesture | null>(null);
	const [hover, setHover] = useState<Snap | null>(null);
	const [message, setMessage] = useState("");

	const others = (ids: string[]) => spaces.filter((s) => !ids.includes(s.id));

	const mergeSelected = () => {
		const polys = spaces
			.filter((s) => selected.includes(s.id))
			.map((s) => s.points);
		if (polys.length < 2)
			return setMessage("Shift-click two or more touching Spaces to merge.");
		const merged = mergePolygons(polys);
		if (!merged)
			return setMessage("Those Spaces don't touch, so they can't be merged.");
		const id = newId();
		commit(
			[...others(selected), { id, points: merged }],
			`merge ${selected.join("+")} → ${id}`,
		);
		setSelected([id]);
		setMessage("");
	};

	const deleteSelected = () => {
		if (!selected.length) return;
		commit(others(selected), `delete ${selected.join(", ")}`);
		setSelected([]);
	};

	useEffect(() => {
		props.setHint(
			mode === "split"
				? "Split: drag a line across a Space to cut it in two · Esc to go back"
				: "Drag on empty space to draw a box · click to select (Shift for more) · drag to move · drag corners or edge squares to reshape · double-click an edge square to add a corner · S split · M merge · Delete",
		);
		props.setDebug({
			tool: mode,
			selected,
			gesture: gesture?.type ?? null,
			snap: hover?.kind ?? null,
		});
	});

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setMode("box");
				setSelected([]);
				setGesture(null);
			}
			if (e.key === "s") setMode("split");
			if (e.key === "m") mergeSelected();
			if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	const pointer = () => worldPointer(stageRef.current);

	/** Pull a moved group onto the nearest snap target of any of its corners. */
	const magneticOffset = (ids: string[], offset: Pt): Pt => {
		let best: Pt = offset;
		let bestD = Number.POSITIVE_INFINITY;
		for (const s of spaces.filter((sp) => ids.includes(sp.id))) {
			for (const v of s.points) {
				const moved = { x: v.x + offset.x, y: v.y + offset.y };
				const hit = snap(moved, { spaces: others(ids), tolerance, grid: null });
				if (hit.kind === "none") continue;
				const d = dist(hit.point, moved);
				if (d < bestD) {
					bestD = d;
					best = {
						x: offset.x + hit.point.x - moved.x,
						y: offset.y + hit.point.y - moved.y,
					};
				}
			}
		}
		return best;
	};

	const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
		if (panning || e.evt.button !== 0 || e.target !== e.target.getStage())
			return;
		const p = pointer();
		if (!p) return;
		const start = snap(p, { spaces, tolerance, grid }).point;
		if (mode === "split")
			return setGesture({ type: "split", start, end: start });
		setSelected([]);
		setGesture({ type: "box", start, end: start });
	};

	const onSpaceMouseDown = (
		id: string,
		e: Konva.KonvaEventObject<MouseEvent>,
	) => {
		if (panning || e.evt.button !== 0) return;
		const p = pointer();
		if (!p) return;
		if (mode === "split") {
			setSelected([id]);
			const start = snap(p, { spaces, tolerance, grid }).point;
			return setGesture({ type: "split", start, end: start });
		}
		const ids = e.evt.shiftKey
			? selected.includes(id)
				? selected.filter((s) => s !== id)
				: [...selected, id]
			: selected.includes(id)
				? selected
				: [id];
		setSelected(ids);
		setGesture({ type: "move", start: p, offset: { x: 0, y: 0 }, ids });
	};

	const onMouseMove = () => {
		const p = pointer();
		if (!p || panning) return;
		if (!gesture) return setHover(snap(p, { spaces, tolerance, grid }));
		if (gesture.type === "move") {
			const offset = magneticOffset(gesture.ids, {
				x: p.x - gesture.start.x,
				y: p.y - gesture.start.y,
			});
			setGesture({ ...gesture, offset });
		} else {
			const from = gesture.type === "split" ? gesture.start : undefined;
			const s = snap(p, {
				spaces,
				tolerance,
				grid,
				from,
				extraVertices: [gesture.start],
			});
			setHover(s);
			setGesture({ ...gesture, end: s.point });
		}
	};

	const onMouseUp = () => {
		const g = gesture;
		setGesture(null);
		if (!g) return;
		if (g.type === "box") {
			const x0 = Math.min(g.start.x, g.end.x);
			const x1 = Math.max(g.start.x, g.end.x);
			const y0 = Math.min(g.start.y, g.end.y);
			const y1 = Math.max(g.start.y, g.end.y);
			if (x1 - x0 < 5 || y1 - y0 < 5) return;
			const id = newId();
			const points = [
				{ x: x0, y: y0 },
				{ x: x1, y: y0 },
				{ x: x1, y: y1 },
				{ x: x0, y: y1 },
			];
			commit([...spaces, { id, points }], `box ${id}`);
			// Not auto-selected: its corner handles would grab the next box started at a shared corner.
		}
		if (g.type === "move" && (g.offset.x !== 0 || g.offset.y !== 0)) {
			commit(
				spaces.map((s) =>
					g.ids.includes(s.id)
						? {
								...s,
								points: s.points.map((v) => ({
									x: v.x + g.offset.x,
									y: v.y + g.offset.y,
								})),
							}
						: s,
				),
				`move ${g.ids.join(", ")}`,
			);
		}
		if (g.type === "split") {
			const mid = {
				x: (g.start.x + g.end.x) / 2,
				y: (g.start.y + g.end.y) / 2,
			};
			const target =
				spaces.find((s) => selected.includes(s.id)) ??
				spaces.find((s) => pointInPolygon(mid, s.points));
			if (!target) return setMessage("Draw the split line across a Space.");
			const pieces = splitPolygon(target.points, g.start, g.end);
			if (!pieces)
				return setMessage(
					"That line doesn't cut all the way across the Space.",
				);
			const created: ProtoSpace[] = pieces.map((points) => ({
				id: newId(),
				points,
			}));
			commit(
				[...others([target.id]), ...created],
				`split ${target.id} → ${created.map((c) => c.id).join(", ")}`,
			);
			setSelected(created.map((c) => c.id));
			setMode("box");
			setMessage("");
		}
	};

	const shown =
		gesture?.type === "move"
			? spaces.map((s) =>
					gesture.ids.includes(s.id)
						? {
								...s,
								points: s.points.map((v) => ({
									x: v.x + gesture.offset.x,
									y: v.y + gesture.offset.y,
								})),
							}
						: s,
				)
			: spaces;
	const single =
		selected.length === 1 && gesture?.type !== "move"
			? spaces.find((s) => s.id === selected[0])
			: null;

	return (
		<>
			<div style={toolbarStyle}>
				<button
					type="button"
					style={btn(mode === "box")}
					onClick={() => setMode("box")}
				>
					▭ Box
				</button>
				<button
					type="button"
					style={btn(mode === "split")}
					onClick={() => setMode("split")}
				>
					✂ Split (S)
				</button>
				<button type="button" style={btn(false)} onClick={mergeSelected}>
					⧉ Merge (M)
				</button>
				<button type="button" style={btn(false)} onClick={deleteSelected}>
					🗑 Delete
				</button>
				{message && (
					<span style={{ color: "#b91c1c", marginLeft: 8 }}>{message}</span>
				)}
			</div>
			<Stage
				ref={stageRef}
				{...stageProps}
				onMouseDown={onStageMouseDown}
				onMouseMove={onMouseMove}
				onMouseUp={onMouseUp}
			>
				<UnderlayLayer underlay={underlay} opacity={props.underlayOpacity} />
				<SpacesLayer
					spaces={shown}
					selected={selected}
					overlaps={props.overlaps}
					scale={view.scale}
					onSpaceMouseDown={onSpaceMouseDown}
				/>
				<Layer>
					{gesture?.type === "box" && (
						<Rect
							x={Math.min(gesture.start.x, gesture.end.x)}
							y={Math.min(gesture.start.y, gesture.end.y)}
							width={Math.abs(gesture.end.x - gesture.start.x)}
							height={Math.abs(gesture.end.y - gesture.start.y)}
							stroke="#ea580c"
							strokeWidth={2 / view.scale}
							fill="rgba(234,88,12,0.12)"
							listening={false}
						/>
					)}
					{gesture?.type === "split" && (
						<Line
							points={[
								gesture.start.x,
								gesture.start.y,
								gesture.end.x,
								gesture.end.y,
							]}
							stroke="#dc2626"
							strokeWidth={2 / view.scale}
							dash={[8 / view.scale, 4 / view.scale]}
							listening={false}
						/>
					)}
					{single && mode === "box" && (
						<>
							<VertexHandles
								space={single}
								spaces={spaces}
								commit={commit}
								grid={grid}
								scale={view.scale}
								tolerance={tolerance}
								onSnap={setHover}
							/>
							<EdgeHandles
								space={single}
								spaces={spaces}
								commit={commit}
								scale={view.scale}
								tolerance={tolerance}
							/>
						</>
					)}
					<SnapIndicator snap={hover} scale={view.scale} />
				</Layer>
			</Stage>
		</>
	);
}

/** Square handles on each edge: drag to push the whole wall in or out; double-click to add a corner. */
function EdgeHandles({
	space,
	spaces,
	commit,
	scale,
	tolerance,
}: {
	space: ProtoSpace;
	spaces: ProtoSpace[];
	commit: VariantProps["commit"];
	scale: number;
	tolerance: number;
}) {
	const [draft, setDraft] = useState<Pt[] | null>(null);
	const points = draft ?? space.points;
	const size = 10 / scale;

	return (
		<>
			{points.map((a, i) => {
				const j = (i + 1) % points.length;
				const b = points[j]!;
				const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				const len = dist(a, b) || 1;
				const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
				const original = space.points;
				return (
					<Rect
						// biome-ignore lint/suspicious/noArrayIndexKey: edge order is identity here
						key={i}
						x={mid.x - size / 2}
						y={mid.y - size / 2}
						width={size}
						height={size}
						fill="#1d4fc4"
						draggable
						onDblClick={() => {
							const next = [...original];
							next.splice(j, 0, mid);
							commit(
								spaces.map((s) =>
									s.id === space.id ? { ...s, points: next } : s,
								),
								`add corner to ${space.id}`,
							);
						}}
						onDragMove={(e) => {
							const oa = original[i]!;
							const ob = original[j]!;
							const omid = { x: (oa.x + ob.x) / 2, y: (oa.y + ob.y) / 2 };
							const p = {
								x: e.target.x() + size / 2,
								y: e.target.y() + size / 2,
							};
							let t = (p.x - omid.x) * n.x + (p.y - omid.y) * n.y;
							const s = snap(
								{ x: omid.x + n.x * t, y: omid.y + n.y * t },
								{
									spaces: spaces.filter((sp) => sp.id !== space.id),
									tolerance,
									grid: null,
								},
							);
							if (s.kind !== "none")
								t = (s.point.x - omid.x) * n.x + (s.point.y - omid.y) * n.y;
							const next = original.map((v, k) =>
								k === i || k === j ? { x: v.x + n.x * t, y: v.y + n.y * t } : v,
							);
							e.target.position({
								x: omid.x + n.x * t - size / 2,
								y: omid.y + n.y * t - size / 2,
							});
							setDraft(next);
						}}
						onDragEnd={() => {
							if (draft) {
								commit(
									spaces.map((s) =>
										s.id === space.id ? { ...s, points: draft } : s,
									),
									`push wall of ${space.id}`,
								);
							}
							setDraft(null);
						}}
					/>
				);
			})}
			{draft && (
				<Line
					points={draft.flatMap((p) => [p.x, p.y])}
					closed
					stroke="#ea580c"
					strokeWidth={2 / scale}
				/>
			)}
		</>
	);
}

const toolbarStyle = {
	position: "absolute",
	top: 12,
	left: 12,
	zIndex: 10,
	display: "flex",
	gap: 6,
	alignItems: "center",
	font: "13px system-ui, sans-serif",
} as const;

const btn = (active: boolean) =>
	({
		padding: "6px 10px",
		borderRadius: 6,
		border: "1px solid #cbd5e1",
		background: active ? "#1d4fc4" : "#fff",
		color: active ? "#fff" : "#0f172a",
		cursor: "pointer",
	}) as const;
