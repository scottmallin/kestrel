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
