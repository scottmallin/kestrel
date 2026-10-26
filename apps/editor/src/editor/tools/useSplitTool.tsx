import type { Space } from "@kestrel/domain";
import { type Point, type Snap, snap, splitOutline } from "@kestrel/geometry";
import { useState } from "react";
import { DraftOutline, SnapMarker } from "../shapes.tsx";
import {
	newSpaceId,
	outlinesOf,
	type Tool,
	type ToolContext,
} from "../tool.ts";

/** Drag a line across Spaces to cut them; every Space the line fully crosses is split, as one undo step. */
export function useSplitTool(ctx: ToolContext): Tool {
	const { draft, store, tolerance, grid, scale } = ctx;
	const [line, setLine] = useState<{ start: Point; end: Point } | null>(null);
	const [hover, setHover] = useState<Snap | null>(null);
	const outlines = outlinesOf(draft);

	const snapAt = (p: Point, from?: Point) =>
		snap(p, {
			outlines,
			tolerance,
			...(grid && { grid }),
			...(from && { drawing: [from] }),
		});

	return {
		hint: "Drag a line across a Space to cut it in two · Esc to go back to Box",
		overlay: (
			<>
				{line && (
					<DraftOutline
						outline={[line.start, line.end]}
						closed={false}
						scale={scale}
					/>
				)}
				<SnapMarker snap={hover} scale={scale} />
			</>
		),
		onPointerDown({ point }) {
			const start = snapAt(point).point;
			setLine({ start, end: start });
		},
		onPointerMove({ point }) {
			const s = snapAt(point, line?.start);
			setHover(s);
			if (line) setLine({ ...line, end: s.point });
		},
		onPointerUp() {
			const l = line;
			setLine(null);
			if (!l) return;
			const cut: { space: Space; pieces: Point[][] }[] = [];
			for (const space of Object.values(draft.spaces)) {
				const pieces = splitOutline(space.outline, l.start, l.end);
				if (pieces) cut.push({ space, pieces: pieces.map((p) => [...p]) });
			}
			if (cut.length === 0) {
				store.setState({
					error: "Draw the line all the way across a Space to split it.",
				});
				return;
			}
			store.getState().perform({
				type: "replaceSpaces",
				remove: cut.map((c) => c.space.id),
				add: cut.flatMap(({ space, pieces }) =>
					pieces.map((outline) => ({
						id: newSpaceId(),
						levelId: space.levelId,
						kind: space.kind,
						outline,
					})),
				),
			});
		},
		onKeyDown(e) {
			if (e.key === "Escape" && line) {
				setLine(null);
				return true;
			}
			return false;
		},
	};
}
