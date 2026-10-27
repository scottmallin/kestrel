import type { Space } from "@kestrel/domain";
import { type Point, type Polygon, type Snap, snap } from "@kestrel/geometry";
import { useState } from "react";
import {
	DraftOutline,
	HANDLE_PIXELS,
	Handles,
	SnapMarker,
} from "../shapes.tsx";
import {
	newSpaceId,
	outlinesOf,
	type Tool,
	type ToolContext,
} from "../tool.ts";

type Gesture =
	| { type: "box"; start: Point; end: Point }
	| { type: "move"; ids: readonly string[]; start: Point; offset: Point }
	| { type: "corner"; space: Space; index: number; outline: Polygon }
	| { type: "edge"; space: Space; index: number; outline: Polygon };

/** Smallest box side, in metres; anything smaller is treated as a click. */
const MIN_BOX = 0.25;

/**
 * Drag on empty floor to draw a box; click a Space to select it (Shift to add); drag to move;
 * with one Space selected, drag its corners or push its walls, and double-click a wall's square to add a corner.
 */
export function useBoxTool(ctx: ToolContext): Tool {
	const { draft, selection, store, tolerance, grid, scale } = ctx;
	const [gesture, setGesture] = useState<Gesture | null>(null);
	const [hover, setHover] = useState<Snap | null>(null);

	const spaces = Object.values(draft.spaces);
	const selected =
		selection.length === 1 ? draft.spaces[selection[0] as string] : undefined;
	const outlines = outlinesOf(draft);
	const grab = (HANDLE_PIXELS / scale) * 1.2;

	const handleAt = (p: Point) => {
		if (!selected) return null;
		const outline = selected.outline;
		const corner = outline.findIndex(
			(c) => Math.hypot(c.x - p.x, c.y - p.y) <= grab,
		);
		if (corner >= 0) return { type: "corner" as const, index: corner };
		const edge = outline.findIndex((a, i) => {
			const b = outline[(i + 1) % outline.length] as Point;
			return Math.hypot((a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y) <= grab;
		});
		return edge >= 0 ? { type: "edge" as const, index: edge } : null;
	};

	const snapFree = (p: Point, exclude?: { outline: number; corner: number }) =>
		snap(p, {
			outlines,
			tolerance,
			...(grid && { grid }),
			...(exclude && { exclude }),
		});

	/** Pulls a moved group onto the nearest snap target of any of its corners. */
	const magnetic = (ids: readonly string[], offset: Point): Point => {
		const others = spaces
			.filter((s) => !ids.includes(s.id))
			.map((s) => s.outline);
		let best = offset;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const id of ids) {
			for (const corner of draft.spaces[id]?.outline ?? []) {
				const moved = { x: corner.x + offset.x, y: corner.y + offset.y };
				const hit = snap(moved, { outlines: others, tolerance });
				if (hit.kind === "none") continue;
				const d = Math.hypot(hit.point.x - moved.x, hit.point.y - moved.y);
				if (d < bestDistance) {
					bestDistance = d;
					best = {
						x: offset.x + hit.point.x - moved.x,
						y: offset.y + hit.point.y - moved.y,
					};
				}
			}
		}
		return best;
	};

	const translate = (outline: Polygon, by: Point) =>
		outline.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));

	const preview: Record<string, Polygon> = {};
	if (gesture?.type === "move") {
		for (const id of gesture.ids) {
			const space = draft.spaces[id];
			if (space) preview[id] = translate(space.outline, gesture.offset);
		}
	}
	if (gesture?.type === "corner" || gesture?.type === "edge")
		preview[gesture.space.id] = gesture.outline;

	const boxOutline = (g: { start: Point; end: Point }): Polygon => [
		{ x: Math.min(g.start.x, g.end.x), y: Math.min(g.start.y, g.end.y) },
		{ x: Math.max(g.start.x, g.end.x), y: Math.min(g.start.y, g.end.y) },
		{ x: Math.max(g.start.x, g.end.x), y: Math.max(g.start.y, g.end.y) },
		{ x: Math.min(g.start.x, g.end.x), y: Math.max(g.start.y, g.end.y) },
	];

	const shownOutline = selected && (preview[selected.id] ?? selected.outline);

	return {
		hint: selected
			? "Drag corners or wall squares to reshape · double-click a wall square to add a corner · drag inside to move · Delete removes"
			: "Drag on empty floor to draw a box · click a Space to select it (Shift adds more)",
		preview,
		overlay: (
			<>
				{gesture?.type === "box" && (
					<DraftOutline outline={boxOutline(gesture)} closed scale={scale} />
				)}
				{shownOutline && gesture?.type !== "move" && (
					<Handles outline={shownOutline} scale={scale} />
				)}
				<SnapMarker snap={hover} scale={scale} />
			</>
		),

		onPointerDown({ point, shift, detail, spaceId }) {
			const handle = handleAt(point);
			if (selected && handle) {
				if (handle.type === "edge" && detail >= 2) {
					const outline = [...selected.outline];
					const a = outline[handle.index] as Point;
					const b = outline[(handle.index + 1) % outline.length] as Point;
					outline.splice(handle.index + 1, 0, {
						x: (a.x + b.x) / 2,
						y: (a.y + b.y) / 2,
					});
					store
						.getState()
						.perform({ type: "reshapeSpace", id: selected.id, outline });
					return;
				}
				setGesture({
					type: handle.type,
					space: selected,
					index: handle.index,
					outline: selected.outline,
				});
				return;
			}
			if (spaceId) {
				const next = shift
					? selection.includes(spaceId)
						? selection.filter((id) => id !== spaceId)
						: [...selection, spaceId]
					: selection.includes(spaceId)
						? selection
						: [spaceId];
				store.getState().select(next);
				if (next.includes(spaceId))
					setGesture({
						type: "move",
						ids: next,
						start: point,
						offset: { x: 0, y: 0 },
					});
				return;
			}
			store.getState().select([]);
			const start = snapFree(point).point;
			setGesture({ type: "box", start, end: start });
		},

		onPointerMove({ point }) {
			if (!gesture) {
				setHover(handleAt(point) ? null : snapFree(point));
				return;
			}
			if (gesture.type === "box") {
				const s = snapFree(point);
				setHover(s);
				setGesture({ ...gesture, end: s.point });
			} else if (gesture.type === "move") {
				setGesture({
					...gesture,
					offset: magnetic(gesture.ids, {
						x: point.x - gesture.start.x,
						y: point.y - gesture.start.y,
					}),
				});
			} else if (gesture.type === "corner") {
				const outlineIndex = spaces.findIndex((s) => s.id === gesture.space.id);
				const s = snapFree(point, {
					outline: outlineIndex,
					corner: gesture.index,
				});
				setHover(s);
				setGesture({
					...gesture,
					outline: gesture.space.outline.map((c, i) =>
						i === gesture.index ? s.point : c,
					),
				});
			} else {
				// Push the whole wall along its normal, snapping its midpoint to other Spaces.
				const original = gesture.space.outline;
				const a = original[gesture.index] as Point;
				const b = original[(gesture.index + 1) % original.length] as Point;
				const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
				const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
				const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				let t =
					(point.x - middle.x) * normal.x + (point.y - middle.y) * normal.y;
				const others = spaces
					.filter((s) => s.id !== gesture.space.id)
					.map((s) => s.outline);
				const s = snap(
					{ x: middle.x + normal.x * t, y: middle.y + normal.y * t },
					{ outlines: others, tolerance, ...(grid && { grid }) },
				);
				if (s.kind !== "none")
					t =
						(s.point.x - middle.x) * normal.x +
						(s.point.y - middle.y) * normal.y;
				setHover(s.kind === "none" ? null : s);
				const pushed = (i: number) =>
					i === gesture.index || i === (gesture.index + 1) % original.length;
				setGesture({
					...gesture,
					outline: original.map((c, i) =>
						pushed(i) ? { x: c.x + normal.x * t, y: c.y + normal.y * t } : c,
					),
				});
			}
		},

		onPointerUp() {
			const g = gesture;
			setGesture(null);
			if (!g) return;
			const { perform } = store.getState();
			if (g.type === "box") {
				const outline = boxOutline(g);
				const [min, , max] = outline as [Point, Point, Point, Point];
				if (max.x - min.x < MIN_BOX || max.y - min.y < MIN_BOX) return;
				// Deliberately not selected: its handles would sit where the next box starts (ADR 0002).
				perform({
					type: "addSpace",
					space: {
						id: newSpaceId(),
						levelId: ctx.levelId,
						kind: "unit",
						outline,
					},
				});
			} else if (g.type === "move") {
				if (g.offset.x === 0 && g.offset.y === 0) return;
				const moved = g.ids
					.map((id) => draft.spaces[id])
					.filter((s): s is Space => s !== undefined)
					.map((s) => ({ ...s, outline: translate(s.outline, g.offset) }));
				perform({ type: "replaceSpaces", remove: g.ids, add: moved });
			} else {
				perform({ type: "reshapeSpace", id: g.space.id, outline: g.outline });
			}
		},

		onKeyDown(e) {
			if (e.key === "Escape" && gesture) {
				setGesture(null);
				return true;
			}
			return false;
		},
	};
}
