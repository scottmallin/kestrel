import { type Point, type Snap, snap } from "@kestrel/geometry";
import { useState } from "react";
import { DraftOutline, SnapMarker } from "../shapes.tsx";
import {
	newSpaceId,
	outlinesOf,
	type Tool,
	type ToolContext,
} from "../tool.ts";

/** The fallback tool: click each corner; click the first corner again (or double-click, or Enter) to finish. */
export function usePenTool(ctx: ToolContext): Tool {
	const { draft, store, tolerance, grid, scale } = ctx;
	const [path, setPath] = useState<Point[]>([]);
	const [hover, setHover] = useState<Snap | null>(null);
	const drawing = path.length > 0;

	const snapAt = (p: Point) =>
		snap(p, {
			outlines: outlinesOf(draft),
			tolerance,
			drawing: path,
			...(grid && { grid }),
		});

	const finish = (points: readonly Point[]) => {
		setPath([]);
		// A double-click delivers two clicks first, so drop repeated corners.
		const corners = points.filter(
			(p, i) =>
				i === 0 ||
				Math.hypot(
					p.x - (points[i - 1] as Point).x,
					p.y - (points[i - 1] as Point).y,
				) > 1e-6,
		);
		if (corners.length < 3) return;
		store.getState().perform({
			type: "addSpace",
			space: {
				id: newSpaceId(),
				levelId: ctx.levelId,
				kind: "unit",
				outline: corners,
			},
		});
	};

	const preview = drawing && hover ? [...path, hover.point] : path;

	return {
		hint: drawing
			? "Click to add corners · click the first corner (green ring), double-click or press Enter to finish · Backspace undoes a corner · Esc cancels"
			: "Click to place the first corner · click inside a Space to select it",
		overlay: (
			<>
				{drawing && (
					<DraftOutline
						outline={preview}
						closed={preview.length > 2}
						scale={scale}
					/>
				)}
				<SnapMarker snap={hover} scale={scale} />
			</>
		),
		onPointerDown({ point, detail, spaceId }) {
			if (drawing && detail >= 2) return finish(path);
			const s = snapAt(point);
			if (!drawing && spaceId && s.kind !== "corner" && s.kind !== "edge") {
				store.getState().select([spaceId]);
				return;
			}
			if (s.kind === "close") return finish(path);
			if (!drawing) store.getState().select([]);
			setPath([...path, s.point]);
		},
		onPointerMove({ point }) {
			setHover(snapAt(point));
		},
		onKeyDown(e) {
			if (!drawing) return false;
			if (e.key === "Enter") finish(path);
			else if (e.key === "Backspace") setPath(path.slice(0, -1));
			else if (e.key === "Escape") setPath([]);
			else return false;
			return true;
		},
	};
}
