import type { Draft } from "./draft.ts";

/**
 * What a Level needs before Spaces can be drawn on it (ADR 0008 amendment):
 * - "ready": it has no plan (a blank grid), or its plan is placed;
 * - "setScale": it has a plan and the Building's scale isn't set yet;
 * - "align": it has a plan, the scale is set, and the plan isn't placed yet.
 * Whether a Level has a plan lives outside the Draft (ADR 0007), so the caller says.
 */
export type LevelSetup = "ready" | "setScale" | "align";

export function levelSetup(
	draft: Draft,
	levelId: string,
	{ hasPlan }: { hasPlan: boolean },
): LevelSetup {
	if (!hasPlan || draft.placements[levelId]) return "ready";
	return draft.scaleSet ? "align" : "setScale";
}
