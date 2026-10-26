# 2. Spaces are independent polygons, kept tidy by snapping

Date: 2026-10-26

## Status

Accepted

## Context

Neighbouring Spaces often share a wall (adjacent shop units, rooms along a corridor). There are two ways to model that:

- **Shared edges**: walls and corners are shared, so moving one updates every Space that touches it. This is the CAD approach. It is more correct and makes future wayfinding (finding doors and adjacency) easier.
- **Independent polygons**: each Space owns its own closed outline; the editor keeps outlines tidy by snapping.

The product succeeds or fails on self-serve drawing being easy for non-technical venue staff. That matters more to us than geometric purity, and it's what sets us apart from enterprise tools like Mappedin.

## Decision

Each Space is an independent closed polygon. The editor makes neighbouring Spaces line up by:

- snapping to nearby corners and edges, to 90° and 45° angles, and to a grid;
- closing a shape automatically when the cursor comes near its first point;
- providing Split, Merge and draw-a-rectangle tools;
- flagging overlaps visibly instead of blocking them.

## Consequences

- Editing one Space never surprises the user by moving another.
- Small gaps and overlaps between neighbours can exist; the editor must make them easy to spot and fix.
- Future wayfinding cannot read adjacency from shared edges. It will have to infer adjacency from geometry (edges within a tolerance) or from an explicitly drawn navigation network.

## Amendment (2026-10-26): which drawing tools

We prototyped three ways of creating Spaces on the `prototype/drawing-tools` branch (run `pnpm prototype:drawing` there): Pen (click corners), Boxes (drag rectangles, then reshape, split and merge), and Magic fill (click inside a room; walls are read from the Underlay image with classic image processing, not AI).

**Decision:** Boxes and Magic fill are the primary tools; Pen is the fallback for shapes neither handles well.

Findings that the real editor must honour:

- **Fill leaks through wide openings.** Open shopfronts are wider than any sensible door-gap setting. The editor needs a way to close an opening before filling (e.g. a "draw a wall" stroke), not just the slider.
- **Fill output must be tidied before it is shown.** Simplify the traced outline and square up near-horizontal and near-vertical edges; on a clean plan this gave exact 4-corner rooms.
- **Handles and snapping compete.** Snapping pulls the cursor to a neighbour's corner, which is where a selected neighbour's handle sits. A newly created Space is therefore not auto-selected, and reshaping requires selecting first.
- **Double-click means the same spot.** Konva's `dblclick` fires for any two quick clicks, wherever they are; use the native click count instead.
