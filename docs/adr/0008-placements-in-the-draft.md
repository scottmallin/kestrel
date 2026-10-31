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
- **Existing Underlays** get a Placement from their stored scale, added to every snapshot of their Map's Draft, so logs replay unchanged. The `pixels_per_metre` column goes.

## Consequences

- A rescale is one Operation that can be large (every Space's outline). That's fine at the scale of a venue.
- Uploading a new plan for a Level keeps its Placement; if the new image is framed differently, the plan needs its scale set or aligning again.
- Magic fill converts between plane and image through the Placement, so it works on rotated and offset plans.
