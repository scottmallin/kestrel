# 1. Local-plane geometry with an optional georeference

Date: 2026-10-26

## Status

Accepted

## Context

Spaces are drawn by people in a 2D canvas editor (Konva), which thinks in flat pixel/metric coordinates. But campuses and multi-building venues need to sit on a real-world basemap so outdoor areas line up, "you are here" can use GPS, and Buildings can hand off to external navigation (Google/Apple Maps) at their entrances. Standard indoor formats (GeoJSON, IMDF) are geographic.

Alternatives considered:

- **Local plane only**: simplest, but no basemap overlay, no GPS, no geo export.
- **Store everything as lat/lng**: geo-native, but every editor interaction needs projection, precision gets awkward at room scale, and a mall that never needs geo pays the complexity anyway.

## Decision

Each Building's geometry is stored in its own local planar coordinate system measured in metres. A Building (and the Outdoor Area) may optionally carry a georeference — an anchor position, rotation and scale — which defines a transform from its local plane to WGS84.

The editor always works in local coordinates. Geographic coordinates are derived at publish/export time, never stored as the source of truth.

### Amendment (2026-10-26): Levels share their Building's plane

All Levels of a Building share that Building's local plane, so lifts, stairs and walls line up vertically. The first Level's scale-setting step defines the plane. Every other Level's Underlay is aligned to it by pinning two matching points (e.g. two corners of a lift shaft) to an already-aligned Level, which gives that Underlay's scale, rotation and offset. The Outdoor Area has its own plane, linked to Buildings through their georeferences.

## Consequences

- Drawing stays a plain 2D problem; Buildings without a georeference work fully, just without a basemap.
- Basemap overlay, GPS positioning and GeoJSON/IMDF export depend on the georeference being set; the editor needs a "pin this Building to the world" step.
- Moving or rotating a Building on the world map is a single transform change, not a rewrite of every Space.
- Cross-Building geometry (e.g. future wayfinding paths between Buildings) must be computed in the shared geographic frame, or in the Outdoor Area's plane.
