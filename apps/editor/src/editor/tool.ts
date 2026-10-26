import type { Draft } from "@kestrel/domain";
import type { Point, Polygon } from "@kestrel/geometry";
import type { ReactNode } from "react";
import type { EditorStore } from "./store.ts";
import type { Underlay } from "./underlay.ts";

export type ToolName = "box" | "fill" | "pen" | "split";

export type PointerInfo = {
	/** Pointer position in metres. */
	readonly point: Point;
	readonly shift: boolean;
	/** Native click count, so a double-click means two clicks in the same spot. */
	readonly detail: number;
	/** The topmost Space under the pointer, if any. */
	readonly spaceId: string | null;
};

export type ToolContext = {
	readonly store: EditorStore;
	readonly draft: Draft;
	readonly selection: readonly string[];
	/** Screen pixels per metre. */
	readonly scale: number;
	/** Snapping distance in metres (a fixed number of screen pixels). */
	readonly tolerance: number;
	readonly grid: number | undefined;
	readonly underlay: Underlay | null;
};

/** What the active tool contributes to the canvas and how it reacts to input. */
export type Tool = {
	readonly hint: string;
	/** A problem to show the user, e.g. why a fill failed. */
	readonly status?: string | null;
	/** Konva nodes drawn above the Spaces (previews, handles, snap markers). */
	readonly overlay?: ReactNode;
	/** Tool-specific settings, shown in the toolbar while the tool is active. */
	readonly options?: ReactNode;
	/** Outlines shown in place of the stored ones while a gesture is in progress. */
	readonly preview?: Readonly<Record<string, Polygon>>;
	onPointerDown?: (e: PointerInfo) => void;
	onPointerMove?: (e: PointerInfo) => void;
	onPointerUp?: (e: PointerInfo) => void;
	/** Returns true if the tool handled the key. */
	onKeyDown?: (e: KeyboardEvent) => boolean;
};

export const outlinesOf = (draft: Draft) =>
	Object.values(draft.spaces).map((s) => s.outline);

export const newSpaceId = () => crypto.randomUUID();

/** The Level being edited, until Levels exist in the Draft. */
export const LEVEL_ID = "level-1";
