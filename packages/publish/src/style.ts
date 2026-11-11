import { SPACE_KINDS, type SpaceKind } from "@kestrel/domain";

/**
 * Fill colour for each Space Kind, shared by the editor and everything that draws a published map. Kinds a
 * Visitor treats alike share a colour; ways between floors stand out, since they're how floors connect.
 */
export const SPACE_KIND_COLOURS: Record<SpaceKind, string> = {
	unit: "#dbe7ff",
	room: "#dbe7ff",
	corridor: "#f8fafc",
	"outdoor-path": "#eef7e6",
	toilet: "#cdeee3",
	stairs: "#c9b8fb",
	lift: "#c9b8fb",
	escalator: "#c9b8fb",
	entrance: "#fde7a6",
	void: "#d5dbe3",
	"car-park": "#eceff3",
};

/** Human-readable Space Kind, for directories and labels. */
export const SPACE_KIND_LABELS: Record<SpaceKind, string> = {
	unit: "Unit",
	room: "Room",
	corridor: "Corridor",
	toilet: "Toilets",
	stairs: "Stairs",
	lift: "Lift",
	escalator: "Escalator",
	entrance: "Entrance",
	void: "Void",
	"outdoor-path": "Path",
	"car-park": "Car park",
};

export type LegendEntry = { readonly colour: string; readonly label: string };

/** The key to a map showing these Space Kinds: one entry per colour, naming its kinds, in SPACE_KINDS order. */
export function legendFor(kinds: Iterable<SpaceKind>): LegendEntry[] {
	const shown = new Set(kinds);
	const byColour = new Map<string, string[]>();
	for (const kind of SPACE_KINDS) {
		if (!shown.has(kind)) continue;
		const colour = SPACE_KIND_COLOURS[kind];
		byColour.set(colour, [
			...(byColour.get(colour) ?? []),
			SPACE_KIND_LABELS[kind],
		]);
	}
	return [...byColour].map(([colour, labels]) => ({
		colour,
		label: labels.join(", "),
	}));
}
