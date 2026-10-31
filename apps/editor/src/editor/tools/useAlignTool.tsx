import {
	type Point,
	placementFromPairs,
	type Snap,
	snap,
	toImage,
	toPlane,
} from "@kestrel/geometry";
import { useState } from "react";
import { Circle, Group, Line, Text } from "react-konva";
import { SnapMarker } from "../shapes.tsx";
import { outlinesOf, type Tool, type ToolContext } from "../tool.ts";

/** The ghost of the Level being aligned to, and the points picked on it. */
const GHOST = "#c026d3";
/** Points picked on the plan being aligned. */
const PLAN = "#1d4fc4";

/**
 * Align plan: pin this Level's floor plan to an already-drawn Level by two matching points, like two corners
 * of a lift shaft. Click a point on the plan, then the same point on the ghost of the other Level; twice.
 */
export function useAlignTool(ctx: ToolContext): Tool {
	const { draft, store, scale, tolerance, levelId, underlay } = ctx;
	// Levels with Spaces to align to, nearest floor first. A Level can align its own new plan to its Spaces.
	const candidates = Object.values(draft.levels)
		.filter((l) => Object.values(draft.spaces).some((s) => s.levelId === l.id))
		.sort(
			(a, b) =>
				Number(a.id === levelId) - Number(b.id === levelId) ||
				Math.abs(a.ordinal - (draft.levels[levelId]?.ordinal ?? 0)) -
					Math.abs(b.ordinal - (draft.levels[levelId]?.ordinal ?? 0)),
		);
	const [chosen, setChosen] = useState<string | null>(null);
	const reference = candidates.find((l) => l.id === chosen) ?? candidates[0];
	/** Points on the plan, in image pixels, so they stay on the plan's features however it's placed. */
	const [onPlan, setOnPlan] = useState<Point[]>([]);
	/** Matching points on the reference Level, in metres. */
	const [onGhost, setOnGhost] = useState<Point[]>([]);
	const [hover, setHover] = useState<Snap | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	/** What the last alignment did, shown as the hint until the next click. */
	const [done, setDone] = useState<string | null>(null);

	const ghostOutlines = reference ? outlinesOf(draft, reference.id) : [];
	const pickingGhost = onPlan.length > onGhost.length;
	const reset = () => {
		setOnPlan([]);
		setOnGhost([]);
	};

	const finish = (plan: Point[], ghost: Point[]) => {
		reset();
		const placement = placementFromPairs(
			plan as [Point, Point],
			ghost as [Point, Point],
		);
		if (!placement) {
			setStatus("Pick two different points on each, as far apart as you can.");
			return;
		}
		store.getState().perform({ type: "placeUnderlay", levelId, placement });
		setDone(`Plan aligned to ${reference?.name}. Ctrl+Z undoes it.`);
	};

	if (!underlay)
		return {
			hint: "Upload a floor plan for this Level first, then align it to another Level",
		};
	if (!reference)
		return {
			hint: "Draw some Spaces on another Level first (or set the scale on this plan), then align to them",
		};

	const step = onPlan.length + onGhost.length;
	const hints = [
		"Click a point on this plan you can also find on the ghost, like a corner of the lift shaft",
		`Now click the same point on the ghost of ${reference.name}`,
		"Click a second point on this plan, as far from the first as you can",
		`Now click the same second point on the ghost of ${reference.name}`,
	];

	return {
		hint: (step === 0 && done) || hints[step] || "",
		status,
		options: (
			<label>
				Align to{" "}
				<select
					value={reference.id}
					onChange={(e) => {
						setChosen(e.target.value);
						reset();
					}}
				>
					{candidates.map((l) => (
						<option key={l.id} value={l.id}>
							{l.id === levelId ? `${l.name} (this Level's Spaces)` : l.name}
						</option>
					))}
				</select>
			</label>
		),
		overlay: (
			<>
				{reference.id !== levelId && (
					<Group listening={false} opacity={0.75}>
						{ghostOutlines.map((outline) => (
							<Line
								key={outline.map((p) => `${p.x},${p.y}`).join(" ")}
								points={outline.flatMap((p) => [p.x, p.y])}
								closed
								stroke={GHOST}
								strokeWidth={2 / scale}
								dash={[6 / scale, 4 / scale]}
							/>
						))}
					</Group>
				)}
				{onPlan.map((pixel, i) => {
					const p = toPlane(underlay.placement, pixel);
					const match = onGhost[i];
					return (
						<Group key={`plan-${pixel.x},${pixel.y}`} listening={false}>
							{match && (
								<Line
									points={[p.x, p.y, match.x, match.y]}
									stroke="#64748b"
									strokeWidth={1 / scale}
									dash={[4 / scale, 4 / scale]}
								/>
							)}
							<Marker
								point={p}
								colour={PLAN}
								label={`${i + 1}`}
								scale={scale}
							/>
						</Group>
					);
				})}
				{onGhost.map((p, i) => (
					<Marker
						key={`ghost-${p.x},${p.y}`}
						point={p}
						colour={GHOST}
						label={`${i + 1}`}
						scale={scale}
					/>
				))}
				{pickingGhost && <SnapMarker snap={hover} scale={scale} />}
			</>
		),
		onPointerDown({ point }) {
			setStatus(null);
			setDone(null);
			if (pickingGhost) {
				// Snap to the ghost's corners, where matching points usually are.
				const p = snap(point, { outlines: ghostOutlines, tolerance }).point;
				const ghost = [...onGhost, p];
				if (ghost.length === 2) return finish(onPlan, ghost);
				setOnGhost(ghost);
			} else {
				setOnPlan([...onPlan, toImage(underlay.placement, point)]);
			}
		},
		onPointerMove({ point }) {
			if (pickingGhost)
				setHover(snap(point, { outlines: ghostOutlines, tolerance }));
		},
		onKeyDown(e) {
			if (e.key === "Escape" && step > 0) reset();
			else if (e.key === "Backspace" && step > 0) {
				if (pickingGhost) setOnPlan(onPlan.slice(0, -1));
				else setOnGhost(onGhost.slice(0, -1));
			} else return false;
			return true;
		},
	};
}

function Marker({
	point,
	colour,
	label,
	scale,
}: {
	point: Point;
	colour: string;
	label: string;
	scale: number;
}) {
	return (
		<Group listening={false}>
			<Circle
				x={point.x}
				y={point.y}
				radius={7 / scale}
				fill={colour}
				stroke="#fff"
				strokeWidth={2 / scale}
			/>
			<Text
				x={point.x + 9 / scale}
				y={point.y - 16 / scale}
				text={label}
				fontSize={13 / scale}
				fontStyle="bold"
				fill={colour}
			/>
		</Group>
	);
}
