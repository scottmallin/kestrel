// PROTOTYPE – Variant A: click each corner. Snaps, closes when you click the first point.
import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Layer, Line, Stage } from "react-konva";
import {
	dist,
	newId,
	type Pt,
	pointInPolygon,
	type Snap,
	SnapIndicator,
	SpacesLayer,
	snap,
	UnderlayLayer,
	useViewport,
	type VariantProps,
	VertexHandles,
	worldPointer,
} from "./shared.tsx";

export const name = "Pen – click corners";

export function VariantPen(props: VariantProps) {
	const { spaces, commit, underlay, grid, width, height } = props;
	const stageRef = useRef<Konva.Stage>(null);
	const { view, panning, stageProps, tolerance } = useViewport(
		width,
		height,
		underlay,
	);
	const [path, setPath] = useState<Pt[]>([]);
	const [hover, setHover] = useState<Snap | null>(null);
	const [selected, setSelected] = useState<string | null>(null);

	const drawing = path.length > 0;
	const snapOpts = {
		spaces,
		tolerance,
		grid,
		from: path.at(-1),
		closeTo: path.length >= 3 ? path[0] : undefined,
		extraVertices: path,
	};

	const finish = (raw: Pt[]) => {
		// Double-click fires two clicks first, so drop repeated points.
		const points = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]!) > 0.5);
		if (points.length >= 3) {
			const id = newId();
			commit([...spaces, { id, points }], `draw ${id}`);
			setSelected(id);
		}
		setPath([]);
	};

	useEffect(() => {
		props.setHint(
			drawing
				? "Click to add corners · click the first corner (green ring) or press Enter to finish · Backspace removes last · Esc cancels"
				: "Click anywhere to start a Space · click inside a Space to select and drag its corners · Delete removes it",
		);
		props.setDebug({
			tool: "pen",
			inProgress: path.length,
			selected,
			snap: hover?.kind ?? null,
		});
	});

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setPath([]);
				setSelected(null);
			}
			if (e.key === "Enter" && drawing) finish(path);
			if (e.key === "Backspace" && drawing) setPath((p) => p.slice(0, -1));
			if (
				(e.key === "Delete" || e.key === "Backspace") &&
				!drawing &&
				selected
			) {
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

	const onMouseMove = () => {
		const p = worldPointer(stageRef.current);
		if (p && !panning) setHover(snap(p, snapOpts));
	};

	const onClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
		if (panning || e.evt.button !== 0) return;
		// Native detail counts clicks in the same spot; Konva's dblclick fires for any two quick clicks.
		if (e.evt.detail >= 2 && drawing) return finish(path);
		const p = worldPointer(stageRef.current);
		if (!p) return;
		const s = snap(p, snapOpts);
		if (!drawing) {
			// Clicking inside a Space (not on its edge) selects it; anywhere else starts drawing.
			const inside = [...spaces]
				.reverse()
				.find((sp) => pointInPolygon(p, sp.points));
			if (inside && s.kind !== "vertex" && s.kind !== "edge") {
				setSelected(inside.id);
				return;
			}
			setSelected(null);
		}
		if (s.kind === "close") return finish(path);
		setPath((prev) => [...prev, s.point]);
	};

	const selectedSpace = spaces.find((s) => s.id === selected);
	const previewEnd = hover?.point;

	return (
		<Stage
			ref={stageRef}
			{...stageProps}
			onMouseMove={onMouseMove}
			onClick={onClick}
		>
			<UnderlayLayer underlay={underlay} opacity={props.underlayOpacity} />
			<SpacesLayer
				spaces={spaces}
				selected={selected ? [selected] : []}
				overlaps={props.overlaps}
				scale={view.scale}
			/>
			<Layer>
				{drawing && (
					<Line
						points={[...path, ...(previewEnd ? [previewEnd] : [])].flatMap(
							(p) => [p.x, p.y],
						)}
						stroke="#ea580c"
						strokeWidth={2 / view.scale}
						fill="rgba(234,88,12,0.12)"
						closed={path.length >= 2}
						listening={false}
					/>
				)}
				{selectedSpace && !drawing && (
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
	);
}
