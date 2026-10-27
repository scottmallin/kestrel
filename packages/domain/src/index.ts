import type { Polygon } from "@kestrel/geometry";

// Terms here follow GLOSSARY.md; check it before adding or renaming anything.

export const SPACE_KINDS = [
	"unit",
	"room",
	"corridor",
	"toilet",
	"stairs",
	"lift",
	"escalator",
	"entrance",
	"void",
	"outdoor-path",
	"car-park",
] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

export type Space = {
	readonly id: string;
	readonly levelId: string;
	readonly kind: SpaceKind;
	readonly reference?: string;
	readonly outline: Polygon;
};

export type Level = {
	readonly id: string;
	readonly buildingId: string;
	readonly name: string;
	readonly ordinal: number;
};

export type Building = {
	readonly id: string;
	readonly mapId: string;
	readonly name: string;
};

export type Listing = {
	readonly id: string;
	readonly mapId: string;
	readonly name: string;
	readonly categoryId?: string;
	readonly spaceIds: readonly string[];
};

export * from "./draft.ts";
export * from "./history.ts";
export * from "./parse.ts";
