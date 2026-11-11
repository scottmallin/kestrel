import {
	containsPoint,
	type Point,
	type Polygon,
	type Snap,
	snap,
	suggestWallDarkness,
	type WallMask,
} from "@kestrel/geometry";
import { useRef, useState } from "react";
import { Line } from "react-konva";
import { COLOURS, DraftOutline, SnapMarker } from "../shapes.tsx";
import {
	newSpaceId,
	outlinesOf,
	type Tool,
	type ToolContext,
} from "../tool.ts";
import {
	type ClosedOpening,
	planHistogram,
	traceOnPlan,
	type Underlay,
	wallMaskFrom,
} from "../underlay.ts";

/** A press that moves further than this (screen pixels) draws an opening instead of filling. */
const DRAG_PIXELS = 6;
/** Doorways up to this wide (metres) are closed, if the room leaks without closing them. */
const DOOR_GAP_METRES = 2;

/**
 * Magic fill: click inside a room on the Underlay to propose its outline, then accept or reject it.
 * Drag across a wide opening (like a shopfront) to close it, so the fill stays in the room.
 */
/** Wall darkness before a plan is open (it's suggested from the plan's pixels once it is). */
const DEFAULT_DARKNESS = 110;

export function useFillTool(ctx: ToolContext): Tool {
	const { draft, store, underlay, tolerance, scale } = ctx;
	const [doorGap, setDoorGap] = useState(DOOR_GAP_METRES);
	// Null until the user moves the slider: then the darkness is suggested from each plan's own pixels.
	const [chosenDarkness, setDarkness] = useState<number | null>(null);
	const [openings, setOpenings] = useState<ClosedOpening[]>([]);
	const [proposal, setProposal] = useState<Polygon | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [hover, setHover] = useState<Snap | null>(null);
	const [stroke, setStroke] = useState<{ start: Point; end: Point } | null>(
		null,
	);
	const press = useRef<Point | null>(null);

	// Read once per plan image: reading every pixel is slow.
	const suggested = useRef<{
		image: HTMLImageElement;
		darkness: number;
	} | null>(null);
	const autoDarkness = (u: Underlay) => {
		if (suggested.current?.image !== u.image)
			suggested.current = {
				image: u.image,
				darkness: suggestWallDarkness(planHistogram(u.image)),
			};
		return suggested.current.darkness;
	};
	const darkness =
		chosenDarkness ?? (underlay ? autoDarkness(underlay) : DEFAULT_DARKNESS);

	// Built on first use, and rebuilt only when its inputs change: reading every pixel is slow.
	const maskCache = useRef<{ inputs: unknown[]; mask: WallMask } | null>(null);
	const wallMask = (u: Underlay) => {
		const inputs = [u, darkness, openings];
		const cached = maskCache.current;
		if (cached?.inputs.every((v, i) => v === inputs[i])) return cached.mask;
		const mask = wallMaskFrom(u, darkness, openings);
		maskCache.current = { inputs, mask };
		return mask;
	};

	const accept = () => {
		if (!proposal) return;
		store.getState().perform({
			type: "addSpace",
			space: {
				id: newSpaceId(),
				levelId: ctx.levelId,
				kind: "unit",
				outline: proposal,
			},
		});
		setProposal(null);
	};

	const fill = (point: Point) => {
		if (!underlay) {
			setStatus("Open a floor plan first: Magic fill reads the rooms from it.");
			return;
		}
		const result = traceOnPlan(wallMask(underlay), underlay.placement, point, {
			doorGap: doorGap / underlay.placement.scale,
			occupied: outlinesOf(draft, ctx.levelId),
		});
		setStatus(result.ok ? null : result.reason);
		setProposal(result.ok ? result.outline : null);
	};

	const snapOpening = (p: Point, from?: Point) =>
		snap(p, {
			outlines: outlinesOf(draft, ctx.levelId),
			tolerance,
			...(from && { drawing: [from] }),
		});

	return {
		hint: proposal
			? "Enter or click inside the orange outline to keep it · Esc to reject · click another room to try again"
			: "Click inside a room on the plan · drag across a wide opening (like a shopfront) to close it first",
		status,
		options: (
			<>
				<label title="If a room leaks through a doorway, openings up to this wide are closed">
					Door gap {doorGap.toFixed(1)} m{" "}
					<input
						type="range"
						min={0}
						max={5}
						step={0.1}
						value={doorGap}
						onChange={(e) => setDoorGap(Number(e.target.value))}
					/>
				</label>
				<label title="Higher counts paler lines as walls. Set automatically from the plan until you move it.">
					Wall sensitivity {Math.round((darkness / 255) * 100)}%
					{chosenDarkness === null && " (auto)"}{" "}
					<input
						type="range"
						min={40}
						max={240}
						value={darkness}
						onChange={(e) => setDarkness(Number(e.target.value))}
					/>
				</label>
				{chosenDarkness !== null && (
					<button type="button" onClick={() => setDarkness(null)}>
						Auto
					</button>
				)}
				<button
					type="button"
					disabled={openings.length === 0}
					onClick={() => setOpenings([])}
				>
					Clear closed openings ({openings.length})
				</button>
			</>
		),
		overlay: (
			<>
				{openings.map(([a, b]) => (
					<Line
						key={`${a.x},${a.y},${b.x},${b.y}`}
						points={[a.x, a.y, b.x, b.y]}
						stroke={COLOURS.overlap}
						strokeWidth={3 / scale}
						listening={false}
					/>
				))}
				{stroke && (
					<Line
						points={[
							stroke.start.x,
							stroke.start.y,
							stroke.end.x,
							stroke.end.y,
						]}
						stroke={COLOURS.overlap}
						strokeWidth={3 / scale}
						dash={[6 / scale, 4 / scale]}
						listening={false}
					/>
				)}
				{proposal && <DraftOutline outline={proposal} closed scale={scale} />}
				{stroke && <SnapMarker snap={hover} scale={scale} />}
			</>
		),
		onPointerDown({ point }) {
			press.current = point;
		},
		onPointerMove({ point }) {
			const start = press.current;
			if (!start) return;
			const dragged =
				Math.hypot(point.x - start.x, point.y - start.y) * scale > DRAG_PIXELS;
			if (!dragged && !stroke) return;
			const from = snapOpening(start).point;
			const s = snapOpening(point, from);
			setHover(s);
			setStroke({ start: from, end: s.point });
		},
		onPointerUp({ point, spaceId }) {
			press.current = null;
			if (stroke) {
				setOpenings([...openings, [stroke.start, stroke.end]]);
				setStroke(null);
				setHover(null);
				setProposal(null);
				return;
			}
			if (proposal && containsPoint(proposal, point)) return accept();
			if (spaceId) {
				setProposal(null);
				store.getState().select([spaceId]);
				return;
			}
			store.getState().select([]);
			fill(point);
		},
		onKeyDown(e) {
			if (e.key === "Enter" && proposal) accept();
			else if (e.key === "Escape" && proposal) setProposal(null);
			else return false;
			return true;
		},
	};
}
