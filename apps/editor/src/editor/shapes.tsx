import type { Space } from "@kestrel/domain";
import {
	type Overlap,
	type Point,
	type Polygon,
	polygonArea,
	type Snap,
} from "@kestrel/geometry";
import { Circle, Group, Line, Rect, Text } from "react-konva";

export const COLOURS = {
	space: "#3b6fd8",
	spaceFill: "rgba(59,111,216,0.16)",
	selected: "#1d4fc4",
	selectedFill: "rgba(59,111,216,0.34)",
	draft: "#ea580c",
	draftFill: "rgba(234,88,12,0.18)",
	overlap: "#dc2626",
	overlapFill: "rgba(220,38,38,0.4)",
	label: "#1d3b78",
} as const;

const flat = (outline: Polygon) => outline.flatMap((p) => [p.x, p.y]);

function centre(outline: Polygon): Point {
	const xs = outline.map((p) => p.x);
	const ys = outline.map((p) => p.y);
	return {
		x: (Math.min(...xs) + Math.max(...xs)) / 2,
		y: (Math.min(...ys) + Math.max(...ys)) / 2,
	};
}

type SpacesProps = {
	spaces: readonly Space[];
	preview: Readonly<Record<string, Polygon>> | undefined;
	selection: readonly string[];
	overlaps: readonly Overlap[];
	scale: number;
};

/** All Spaces on the Level, with labels and overlap warnings. Not interactive: tools hit-test themselves. */
export function SpaceShapes({
	spaces,
	preview,
	selection,
	overlaps,
	scale,
}: SpacesProps) {
	return (
		<Group listening={false}>
			{spaces.map((space) => {
				const outline = preview?.[space.id] ?? space.outline;
				const selected = selection.includes(space.id);
				const middle = centre(outline);
				const label = `${space.reference ?? space.kind}\n${polygonArea(outline).toFixed(1)} m²`;
				return (
					<Group key={space.id}>
						<Line
							points={flat(outline)}
							closed
							fill={selected ? COLOURS.selectedFill : COLOURS.spaceFill}
							stroke={selected ? COLOURS.selected : COLOURS.space}
							strokeWidth={(selected ? 3 : 2) / scale}
						/>
						<Text
							x={middle.x}
							y={middle.y}
							width={120 / scale}
							offsetX={60 / scale}
							offsetY={12 / scale}
							text={label}
							align="center"
							fontSize={12 / scale}
							fill={COLOURS.label}
						/>
					</Group>
				);
			})}
			{overlaps.map((overlap) => (
				<Line
					key={`${overlap.between.join("-")}-${overlap.region[0]?.x}-${overlap.region[0]?.y}`}
					points={flat(overlap.region)}
					closed
					fill={COLOURS.overlapFill}
					stroke={COLOURS.overlap}
					strokeWidth={2 / scale}
					dash={[6 / scale, 4 / scale]}
				/>
			))}
		</Group>
	);
}

/** An outline being drawn or proposed, not yet part of the Draft. */
export function DraftOutline({
	outline,
	closed,
	scale,
}: {
	outline: Polygon;
	closed: boolean;
	scale: number;
}) {
	return (
		<Line
			points={flat(outline)}
			closed={closed}
			fill={closed ? COLOURS.draftFill : "transparent"}
			stroke={COLOURS.draft}
			strokeWidth={2 / scale}
			dash={[8 / scale, 4 / scale]}
			listening={false}
		/>
	);
}

const SNAP_COLOURS: Record<Snap["kind"], string> = {
	close: "#16a34a",
	corner: "#ea580c",
	edge: "#ea580c",
	angle: "#7c3aed",
	align: "#db2777",
	grid: "#64748b",
	none: "#94a3b8",
};

/** Shows where the pointer snapped to and why. */
export function SnapMarker({
	snap,
	scale,
}: {
	snap: Snap | null;
	scale: number;
}) {
	if (!snap || snap.kind === "none") return null;
	const colour = SNAP_COLOURS[snap.kind];
	const { x, y } = snap.point;
	return (
		<Group listening={false}>
			{snap.guides.map(([from, to]) => (
				<Line
					key={`${from.x},${from.y}`}
					points={[from.x, from.y, to.x, to.y]}
					stroke={colour}
					strokeWidth={1 / scale}
					dash={[4 / scale, 4 / scale]}
				/>
			))}
			{snap.kind === "close" ? (
				<Circle
					x={x}
					y={y}
					radius={10 / scale}
					stroke={colour}
					strokeWidth={3 / scale}
				/>
			) : snap.kind === "corner" ? (
				<Rect
					x={x - 6 / scale}
					y={y - 6 / scale}
					width={12 / scale}
					height={12 / scale}
					stroke={colour}
					strokeWidth={2 / scale}
				/>
			) : (
				<Circle x={x} y={y} radius={4 / scale} fill={colour} />
			)}
		</Group>
	);
}

/** Corner circles and edge squares for reshaping a single selected Space. */
export function Handles({
	outline,
	scale,
}: {
	outline: Polygon;
	scale: number;
}) {
	const size = HANDLE_PIXELS / scale;
	return (
		<Group listening={false}>
			{outline.map((p, i) => {
				const q = outline[(i + 1) % outline.length] as Point;
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: a corner's position in the outline is its identity
					<Group key={i}>
						<Rect
							x={(p.x + q.x) / 2 - size / 2}
							y={(p.y + q.y) / 2 - size / 2}
							width={size}
							height={size}
							fill={COLOURS.selected}
						/>
						<Circle
							x={p.x}
							y={p.y}
							radius={size * 0.6}
							fill="#fff"
							stroke={COLOURS.selected}
							strokeWidth={2 / scale}
						/>
					</Group>
				);
			})}
		</Group>
	);
}

/** Handle size on screen; also the distance within which a press grabs one. */
export const HANDLE_PIXELS = 10;
