import type { Draft } from "./draft.ts";

/**
 * What a Level needs before Spaces can be drawn on it (ADR 0008 amendment):
 * - "ready": it has no plan (a blank grid), or its plan is scaled and aligned;
 * - "setScale": its plan's scale isn't set (for the first plan, that sets the Building's scale);
 * - "align": its plan's own scale is set, but it isn't aligned to the other floors yet.
 * Whether a Level has a plan lives outside the Draft (ADR 0007), so the caller says.
 */
export type LevelSetup = "ready" | "setScale" | "align";

export function levelSetup(
	draft: Draft,
	levelId: string,
	{ hasPlan }: { hasPlan: boolean },
): LevelSetup {
	if (!hasPlan) return "ready";
	if (!draft.placements[levelId]) return "setScale";
	return draft.unaligned[levelId] ? "align" : "ready";
}
