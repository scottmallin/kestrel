import type { SpaceKind } from "@kestrel/domain";
import { legendFor } from "@kestrel/publish";
import type { CSSProperties } from "react";
import { COLOURS, seeThrough } from "./shapes.tsx";

/** The key to the canvas: the Space Kinds on the Level shown, and overlaps if there are any. */
export function Legend({
	kinds,
	overlapping,
}: {
	kinds: readonly SpaceKind[];
	overlapping: boolean;
}) {
	const entries = legendFor(kinds);
	if (entries.length === 0 && !overlapping) return null;
	return (
		<section aria-label="Key" style={box}>
			{entries.map((entry) => (
				<span key={entry.label} style={row}>
					<span style={swatch(seeThrough(entry.colour), COLOURS.space)} />
					{entry.label}
				</span>
			))}
			{overlapping && (
				<span style={row}>
					<span style={swatch(COLOURS.overlapFill, COLOURS.overlap)} />
					Overlapping
				</span>
			)}
		</section>
	);
}

const box: CSSProperties = {
	position: "absolute",
	left: 12,
	bottom: 12,
	display: "flex",
	flexWrap: "wrap",
	gap: "4px 12px",
	maxWidth: "calc(100% - 24px)",
	padding: "6px 10px",
	background: "rgba(255,255,255,0.92)",
	border: "1px solid #e2e8f0",
	borderRadius: 6,
	// A key, not a control: clicks go through to the canvas.
	pointerEvents: "none",
};
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const swatch = (fill: string, stroke: string): CSSProperties => ({
	width: 14,
	height: 10,
	background: fill,
	border: `1px solid ${stroke}`,
	borderRadius: 2,
});
