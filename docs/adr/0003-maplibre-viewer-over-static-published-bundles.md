# 3. MapLibre viewer reading static Published Version bundles

Date: 2026-10-26

## Status

Accepted

## Context

The editor uses Konva. The public Embed has different needs: smooth pan, zoom and pinch on phones; switching Levels; label collision; and optionally a real-world basemap once a Building is pinned to the world (ADR 0001). It also has to be close to free to serve, because the free tier must cost almost nothing to run.

Alternatives considered:

- **Konva for the viewer too**: one rendering library, but we would have to build gestures, label placement and basemap tiles ourselves.
- **Google Maps JS API**: familiar, but charged per map load and its terms restrict overlays and caching. That doesn't work with a free tier.

## Decision

- The Embed renders with **MapLibre GL** over a low-cost vector basemap (e.g. Protomaps or MapTiler). Buildings without a georeference render on a plain background.
- Publishing a Draft **compiles** it into an unchangeable bundle (GeoJSON plus metadata) stored in object storage behind a CDN. Embeds read only that bundle and never call the API or database.
- Draft data lives in Postgres (via Drizzle), with polygon points stored as `jsonb` in local metres. PostGIS is deferred until we need spatial queries.
- Hand-off to Google or Apple Maps happens through "Get directions" deep links, not by rendering on Google's map engine.

## Consequences

- The editor and the viewer use different rendering stacks. The published bundle format is the contract between them, and styling (Space Kind colours, Amenity icons) has to be defined in a form both can use.
- Amenity icons (Lucide) have to be converted into a MapLibre sprite sheet at build time.
- The cost of serving an Embed is mostly CDN bandwidth, which keeps the free tier viable.
- Changes only appear in an Embed after a publish, so publishing has to be fast and painless.

## Amendment (2026-10-27): the first published bundle

- **Un-pinned Buildings sit at 0°, 0°.** MapLibre only works in longitude/latitude, so until a Building is pinned to the world (ADR 0001), the compiler converts its local metres to degrees at the point where the equator meets the prime meridian (1 m ≈ 1/111,320°; y increases southwards). Distortion there is negligible, so the map looks exactly as drawn. Pinning will replace this with the real transform inside the compiler; nothing downstream changes.
- **The Underlay is not published.** Visitors see styled Spaces, not the floor-plan image. Plans can contain things venues don't want public, and leaving them out keeps bundles small.
- **Until Listings exist, the directory lists Spaces by Space Reference** (with their Space Kind). Spaces without a reference appear on the map only.
- **Embeds are records from the start.** Embed codes point at an Embed id, not a Map id, so codes already on customers' websites survive when Embed settings (Kiosk Mode, Allowed Domains) arrive. Publishing a Map creates its first Embed if it has none.
- **Served by the API for now.** Bundles are stored through the same `Storage` interface as Underlays and served from a public, cacheable route, `GET /api/public/embeds/:id`. Moving that behind a CDN at deployment is configuration, not code.
