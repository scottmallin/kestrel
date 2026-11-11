# 8. Underlay Placements live in the Draft; setting the scale rescales the Building

Date: 2026-10-31

## Status

Accepted. Amends ADR 0007, which kept scale and Alignment outside the Draft.

## Context

Scale-setting and Alignment decide how each Level's Underlay sits on the Building's shared plane (ADR 0001 amendment). Until now every Underlay was assumed to be 20 pixels per metre.

Onboarding lets people skip scale-setting, so Spaces are often traced before the real scale is known. When the scale is set later, the plan grows or shrinks; the Spaces drawn over it must change by the same factor, or they stop matching the plan and every area is wrong. So must every other Level's Underlay, or Alignment breaks.

ADR 0007 kept scale and Alignment outside the Draft. Then a rescale would be half undoable (the Spaces) and half not (the Underlays), and one undo would leave them out of step.

## Decision

- **A Placement says where an Underlay sits on the plane**: a scale (metres per image pixel), a rotation and an offset, so `plane = rotate(pixel × scale) + offset`. The maths is in `packages/geometry`.
- **Placements are part of the Draft**, by Level id. The Underlay _file_ stays outside it (ADR 0007): uploading is a side effect undo can't reverse, but a Placement is just numbers.
- **`placeUnderlay`** sets (or, with null, clears) one Level's Placement. Alignment uses it: two points on the plan and the two matching points on an already-drawn Level give the Placement.
- **`rescaleBuilding`** records its result (ADR 0004): every Space and every Placement as they end up. Setting the scale works out the factor from a drawn line and its real length, then scales the whole plane about its origin: every Space on every Level, and every Placement. Undo restores all of it in one step.
- **A Level with an Underlay but no Placement** shows it at the old default (20 pixels per metre, no rotation, at the origin). Any plan can have its scale set; the first one usually does, and the others are then aligned to it.
- **Placements are never published** (ADR 0003 amendment: the Underlay isn't either).
- **Existing Underlays need no data moved.** Every stored scale was the default 20 pixels per metre, which is exactly where an Underlay without a Placement is shown, so the `pixels_per_metre` column simply goes.

## Consequences

- A rescale is one Operation that can be large (every Space's outline). That's fine at the scale of a venue.
- Uploading a new plan for a Level keeps its Placement; if the new image is framed differently, the plan needs its scale set or aligning again.
- Magic fill converts between plane and image through the Placement, so it works on rotated and offset plans.

## Amendment (2026-10-31): set up a Level before drawing on it

Drawing over a plan before it was scaled or aligned left Spaces stranded when the plan later moved (Align moves the plan, not the Spaces traced on it). And plans are rarely drawn at the same scale as each other, so each needs its own. So:

- **Every plan gets its scale set; every plan but the first is then aligned.** A Level with a plan is locked for drawing until then. Levels without a plan (a blank grid) can always be drawn on: they're on the plane by default.
- **The first scale set is the Building's**, on a plan or by measuring Spaces on a blank grid. It rescales everything (`rescaleBuilding`, which records `scaleSet`). So does setting the scale on a Level that's already set up: that corrects the whole Building.
- **On a later plan, Set scale sets that plan's scale only**: `placeUnderlay` with `aligned: false`, recorded in the Draft's `unaligned`. Align then turns and moves it, keeping that scale (`alignAtScale`). If the two floors disagree about the distance between the matching points by more than 5%, Align refuses: a mis-click or a wrong scale.
- **Align needs the plan's scale set.** Its ghost shows the reference Level's plan as well as its Spaces.
- **Re-uploading a plan clears its Placement**, so the Level starts again: set its scale and align it (to its own Spaces, if it has any). Aligning never moves Spaces: with the lock, Spaces are only ever drawn on set-up plans, so they're already right.
