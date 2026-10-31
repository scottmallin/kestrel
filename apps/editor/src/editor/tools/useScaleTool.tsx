import type { Placement } from "@kestrel/geometry";
import {
	DEFAULT_PLACEMENT,
	type Point,
	rescaleFactor,
	type Snap,
	scalePlacement,
	scalePolygon,
	snap,
} from "@kestrel/geometry";
import { useState } from "react";
import { Circle, Line, Text } from "react-konva";
import { COLOURS, SnapMarker } from "../shapes.tsx";
import { outlinesOf, type Tool, type ToolContext } from "../tool.ts";

const metres = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Set scale: draw a line along something of known length (on the plan, or along a Space), type its real
 * length, and the whole Building rescales to match: every Space and every plan, in one undo step (ADR 0008).
 */
export function useScaleTool(ctx: ToolContext): Tool {
	const { draft, store, tolerance, scale, grid, levelId, underlayLevelIds } =
		ctx;
	const [start, setStart] = useState<Point | null>(null);
	const [line, setLine] = useState<readonly [Point, Point] | null>(null);
	const [hover, setHover] = useState<Snap | null>(null);
	const [length, setLength] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	/** What the last rescale did, shown as the hint until the next click. */
	const [done, setDone] = useState<string | null>(null);

	const snapAt = (p: Point) =>
		snap(p, {
			outlines: outlinesOf(draft, levelId),
			tolerance,
			...(start && { drawing: [start] }),
			...(grid && { grid }),
		});

	const reset = () => {
		setStart(null);
		setLine(null);
		setLength("");
	};

	const apply = () => {
		if (!line) return;
		const factor = rescaleFactor(line[0], line[1], Number(length));
		if (factor === null) {
			setStatus("Type the line's real length in metres, above 0.");
			return;
		}
		// Placed plans scale with everything else. The plan measured on, if it's unplaced, is placed where it's
		// shown; other unplaced plans stay unplaced, to be aligned (ADR 0008 amendment).
		const placements: Record<string, Placement> = {};
		for (const [id, current] of Object.entries(draft.placements))
			placements[id] = scalePlacement(current, factor);
		if (underlayLevelIds.has(levelId) && !draft.placements[levelId])
			placements[levelId] = scalePlacement(DEFAULT_PLACEMENT, factor);
		store.getState().perform({
			type: "rescaleBuilding",
			spaces: Object.values(draft.spaces).map((s) => ({
				...s,
				outline: scalePolygon(s.outline, factor),
			})),
			placements,
			scaleSet: true,
		});
		setDone(
			`Scale set: the line is now ${Number(length)} m, and everything else changed to match. Ctrl+Z undoes it.`,
		);
		reset();
	};

	const end = line?.[1] ?? hover?.point;
	const shown = line ?? (start && end ? ([start, end] as const) : null);

	return {
		hint: done
			? done
			: line
				? "Type the line's real length in metres, then press Enter"
				: start
					? "Click the other end of something whose length you know"
					: "Click one end of something whose length you know, like a wall or a doorway on the plan",
		status,
		options: line && (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					apply();
				}}
				style={{ display: "flex", gap: 6, alignItems: "center" }}
			>
				<label>
					Real length{" "}
					<input
						aria-label="Real length in metres"
						type="number"
						min="0"
						step="any"
						value={length}
						onChange={(e) => setLength(e.target.value)}
						onKeyDown={(e) => e.key === "Escape" && reset()}
						// biome-ignore lint/a11y/noAutofocus: the field appears because the user just finished the line.
						autoFocus
						style={{ width: 80 }}
					/>{" "}
					m
				</label>
				<span style={{ color: "#64748b" }}>
					(drawn as {metres(line[0], line[1]).toFixed(2)} m)
				</span>
				<button type="submit">Set scale</button>
			</form>
		),
		overlay: (
			<>
				{shown && (
					<>
						<Line
							points={[shown[0].x, shown[0].y, shown[1].x, shown[1].y]}
							stroke={COLOURS.draft}
							strokeWidth={3 / scale}
							listening={false}
						/>
						{shown.map((p, i) => (
							<Circle
								// The two ends can sit on the same spot while drawing, so key by which end it is.
								key={i === 0 ? "start" : "end"}
								x={p.x}
								y={p.y}
								radius={5 / scale}
								fill={COLOURS.draft}
								listening={false}
							/>
						))}
						<Text
							x={(shown[0].x + shown[1].x) / 2}
							y={(shown[0].y + shown[1].y) / 2 + 6 / scale}
							text={`${metres(shown[0], shown[1]).toFixed(2)} m`}
							fontSize={13 / scale}
							fill={COLOURS.draft}
							listening={false}
						/>
					</>
				)}
				{!line && <SnapMarker snap={hover} scale={scale} />}
			</>
		),
		onPointerDown({ point }) {
			if (line) return;
			const p = snapAt(point).point;
			setStatus(null);
			setDone(null);
			if (!start) return setStart(p);
			if (metres(start, p) === 0) return;
			setLine([start, p]);
			setStart(null);
		},
		onPointerMove({ point }) {
			if (!line) setHover(snapAt(point));
		},
		onKeyDown(e) {
			if (e.key !== "Escape" || (!start && !line)) return false;
			reset();
			return true;
		},
	};
}
