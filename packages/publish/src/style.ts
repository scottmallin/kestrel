import type { SpaceKind } from "@kestrel/domain";

/** Fill colour for each Space Kind, shared by everything that draws a published map. */
export const SPACE_KIND_COLOURS: Record<SpaceKind, string> = {
	unit: "#dbe7ff",
	room: "#dbe7ff",
	corridor: "#f8fafc",
	toilet: "#d9f2ec",
	stairs: "#ede4ff",
	lift: "#ede4ff",
	escalator: "#ede4ff",
	entrance: "#fff1d6",
	void: "#e2e8f0",
	"outdoor-path": "#eef7e6",
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
