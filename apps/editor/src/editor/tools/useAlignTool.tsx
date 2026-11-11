import {
	alignAtScale,
	type Placement,
	type Point,
	placementFromPairs,
	type Snap,
	snap,
	toImage,
	toPlane,
} from "@kestrel/geometry";
import { useEffect, useState } from "react";
import { Circle, Group, Image as KonvaImage, Line, Text } from "react-konva";
import { SnapMarker } from "../shapes.tsx";
import { outlinesOf, type Tool, type ToolContext } from "../tool.ts";
import { loadUnderlayImage, tintedLines } from "../underlay.ts";

/** How far the two floors may disagree about the distance between the points (clicks aren't exact). */
const MAX_MISMATCH = 0.05;

/** The ghost of the Level being aligned to, and the points picked on it. */
const GHOST = "#c026d3";
const GHOST_RGB = { r: 0xc0, g: 0x26, b: 0xd3 };
/** Points picked on the plan being aligned. */
const PLAN = "#1d4fc4";

/**
 * Align plan: pin this Level's floor plan to an already-drawn Level by two matching points, like two corners
 * of a lift shaft. Click a point on the plan, then the same point on the ghost of the other Level; twice.
 */
export function useAlignTool(ctx: ToolContext): Tool {
	const { draft, store, scale, tolerance, levelId, underlay, underlayUrl } =
		ctx;
	const hasSpaces = (id: string) =>
		Object.values(draft.spaces).some((s) => s.levelId === id);
	// Levels to align to, nearest floor first: others with Spaces or a placed plan, and this Level's own
	// Spaces (for a replaced plan).
	const candidates = Object.values(draft.levels)
		.filter((l) =>
			l.id === levelId
				? hasSpaces(l.id)
				: hasSpaces(l.id) || draft.placements[l.id] !== undefined,
		)
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
	/**
	 * Refused for disagreeing with the plan's scale: the alignment that stretches the plan to fit instead, for
	 * posters whose floors aren't drawn to one scale. Offered until the next click.
	 */
	const [stretched, setStretched] = useState<Placement | null>(null);

	const ghostOutlines = reference ? outlinesOf(draft, reference.id) : [];
	// The other Level's plan, faintly, where it's placed: matching plan to plan is easiest.
	const ghostPlacement =
		reference && reference.id !== levelId
			? draft.placements[reference.id]
			: undefined;
	const ghostUrl =
		ghostPlacement && reference ? underlayUrl(reference.id) : null;
	// Tinted, so it can't be mistaken for the plan being aligned under it.
	const [ghostImage, setGhostImage] = useState<HTMLCanvasElement | null>(null);
	useEffect(() => {
		setGhostImage(null);
		if (!ghostUrl) return;
		let current = true;
		void loadUnderlayImage(ghostUrl).then((image) => {
			if (current) setGhostImage(tintedLines(image, GHOST_RGB));
		});
		return () => {
			current = false;
		};
	}, [ghostUrl]);
	const [showPlan, setShowPlan] = useState(true);
	const [showGhost, setShowGhost] = useState(true);
	const pickingGhost = onPlan.length > onGhost.length;
	const reset = () => {
		setOnPlan([]);
		setOnGhost([]);
		setStretched(null);
	};

	const finish = (plan: Point[], ghost: Point[]) => {
		reset();
		if (!underlay) return;
		// The plan keeps the scale measured on it; the points only turn and move it.
		const result = alignAtScale(
			plan as [Point, Point],
			ghost as [Point, Point],
			underlay.placement.scale,
		);
		if (!result) {
			setStatus("Pick two different points on each, as far apart as you can.");
			return;
		}
		if (Math.abs(result.mismatch) > MAX_MISMATCH) {
			setStatus(
				`Those points are ${Math.round(Math.abs(result.mismatch) * 100)}% ${result.mismatch > 0 ? "further apart" : "closer together"} on ${reference?.name} than on this plan at its scale. Check you picked matching points, or set this plan's scale again. If the floors just aren't drawn to the same scale (common on posters), choose Align anyway: it stretches this plan to fit, in place of its own scale.`,
			);
			setStretched(
				placementFromPairs(plan as [Point, Point], ghost as [Point, Point]),
			);
			return;
		}
		place(result.placement, `Plan aligned to ${reference?.name}.`);
	};

	const place = (placement: Placement, message: string) => {
		store.getState().perform({ type: "placeUnderlay", levelId, placement });
		setDone(`${message} Ctrl+Z undoes it.`);
	};

	const alignAnyway = () => {
		if (!stretched) return;
		setStatus(null);
		setStretched(null);
		place(
			stretched,
			`Plan stretched to fit ${reference?.name}; its own scale was replaced.`,
		);
	};

	if (!underlay)
		return {
			hint: "Upload a floor plan for this Level first, then align it to another Level",
		};
	if (!draft.scaleSet)
		return {
			hint: "Set the scale first (on any Level), then align other floors to it",
		};
	if (!reference)
		return {
			hint: "Nothing to align to yet: set the scale on another Level's plan, or draw Spaces on another Level first",
		};

	const step = onPlan.length + onGhost.length;
	const hints = [
		"Click a point on this plan you can also find on the magenta ghost, like a corner of the lift shaft",
		`Now click the same point on the ghost of ${reference.name} (magenta)`,
		"Click a second point on this plan, as far from the first as you can",
		`Now click the same second point on the ghost of ${reference.name} (magenta)`,
	];

	return {
		hint: (step === 0 && done) || hints[step] || "",
		status,
		hidePlan: !showPlan,
		options: (
			<>
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
				<label>
					<input
						type="checkbox"
						checked={showPlan}
						onChange={(e) => setShowPlan(e.target.checked)}
					/>{" "}
					<Swatch colour={PLAN} /> This plan
				</label>
				<label>
					<input
						type="checkbox"
						checked={showGhost}
						onChange={(e) => setShowGhost(e.target.checked)}
					/>{" "}
					<Swatch colour={GHOST} /> Ghost of {reference.name}
				</label>
				{stretched && (
					<button type="button" onClick={alignAnyway}>
						Align anyway
					</button>
				)}
			</>
		),
		overlay: (
			<>
				{showGhost && ghostImage && ghostPlacement && (
					<KonvaImage
						image={ghostImage}
						x={ghostPlacement.x}
						y={ghostPlacement.y}
						rotation={(ghostPlacement.rotation * 180) / Math.PI}
						scaleX={ghostPlacement.scale}
						scaleY={ghostPlacement.scale}
						opacity={0.6}
						listening={false}
					/>
				)}
				{showGhost && reference.id !== levelId && (
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
			setStretched(null);
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

/** A Level's colour in the toolbar: the key to the markers and ghost on the canvas. */
function Swatch({ colour }: { colour: string }) {
	return (
		<span
			aria-hidden
			style={{
				display: "inline-block",
				width: 10,
				height: 10,
				borderRadius: "50%",
				background: colour,
				verticalAlign: "middle",
			}}
		/>
	);
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
