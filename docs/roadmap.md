# Roadmap & product decisions

Working record of product and stack decisions from design sessions. Use GLOSSARY.md for terms and docs/adr/ for hard-to-reverse architecture decisions.

## Codename

**Kestrel** (it hovers and looks down: a bird's-eye view). The suite umbrella is **Aviary**, with sibling apps named after birds. Working titles only, not yet trademark-checked.

## Lessons from the previous shopping-centre build

- **AI that "vibes together" a map takes away control.** AI output must always be a reviewable Suggestion; it never edits the Draft directly. (Confirms the Phase 1.9 design.)
- **Linking a tenant to a unit had no spatial context.** In Sanity, staff picked "Unit A1" from a list without seeing where it was. In Kestrel, Listings are **always placed on the map**: click a Space to assign a Listing, or drag one from the Unplaced Listings tray. Listing Managers get a read-only map view for this, even though they can't edit geometry.
- Kestrel is the source of truth for Listings. External CMS sync (Sanity etc.) comes later as an import/sync feature, not as a dependency.

## Positioning

- Self-serve, UX-first indoor mapping for **small and mid-sized venues** (shopping centres, schools, offices, event venues). Enterprise (large universities, regional malls) is the top Plan we grow into, not the launch target.
- Differentiator vs Mappedin and similar: "drew my map in 15 minutes, pasted one embed code".
- Visitor experience: a picture of the map plus lookup and a directory at launch. Wayfinding comes later.

## Phases

- **Alpha** (design partners only, billing off, every Organisation gets everything): one Building, multiple Levels with Alignment, Underlay upload (image + PDF), scale-setting, ADR 0002 drawing tools, Space Kinds, Amenities, Listings + Categories (with logos), the Draft/Publish pipeline, one Embed (iframe, directory + search, level switcher, WCAG work started).
- **Beta** (public, self-serve): onboarding flow, Stripe + Plans + limit checks, badge, several Embeds + Kiosk Mode + Allowed Domains, Listing-only publish, Search Event collection + basic dashboard, multiple Buildings + Outdoor Area + georeference/basemap, WCAG 2.2 AA complete.
- **Phase 1.9 – AI tracing**: the AI traces an uploaded Underlay first, while the user sets the scale in parallel. Suggestions are tidied, shown as a ghost layer, and can be accepted or rejected individually or all at once. Only confident Suggestions are shown. Free: 1 trace per Level per month. A **feasibility test happens early** (10–20 real plans, comparing vision LLM, classic computer vision + OCR, and a hybrid), but the build waits.
- **Phase 2+**: wayfinding, real-time multi-user editing (paid), JS SDK and API, suite apps (see suite-ideas.md).

## Alpha partners

2–3 existing clients of different shapes (ideally a retail venue, an education venue and an office/event venue), offered free Pro for a year in exchange for regular feedback. Their real floor plans become the editor test material and the AI feasibility test set.

## Onboarding flow (target: first published map in under 15 minutes)

1. Sign up, which creates an Organisation and its first Map.
2. Upload an Underlay (image or PDF; pick the page for multi-page PDFs), or start on a blank grid.
3. Set the scale with a known measurement. Can be skipped (estimated scale, with a reminder later).
4. Trace Spaces, with an interactive tutorial for the first three.
5. Name Spaces and place Amenities.
6. Publish, then copy the embed code, with a preview on a sample web page.

## Product rules

- Publishing on Free is all or nothing. Republishing Listings without republishing geometry (for Listing Managers) is a premium feature.
- Several Embeds per Map (standard and Kiosk Mode). Free gets one Embed. Allowed Domains are enforced on paid Plans.
- Fire-safety Amenity types (fire exit, extinguisher, call point, assembly point, refuge, first aid) are included from v1, with a "Safety" layer the Visitor can toggle.
- Lettable is a property of a Space Kind. Vacant is worked out, never stored.
- The Embed must meet **WCAG 2.2 AA**. The directory view is the accessible alternative to the map canvas.
- Visitor tracking is **cookieless and stores no personal data** (daily-rotating hashed sessions). "No cookie banner needed."
- The editor is desktop-only in v1. The Embed is mobile-first. Listing management works on mobile.
- Unplaced Listings are allowed in the Draft (an "Unplaced Listings" tray to drag them onto Spaces) but never shown in an Embed. Deleting a Space warns about its linked Listings and unlinks them; it never deletes them.
- Space References are optional and unique within a Building. Listing imports match on Building + reference.
- **Downgrade / non-payment**: nothing is deleted and live Embeds keep working (with the badge). The Draft is read-only beyond the new Plan's limits; no adding content or publishing until back within them. If unpaid for more than 90 days, Embeds show a "map unavailable" placeholder; data is kept.
- Amenity icons use Lucide, with custom icons in Lucide's style where it has gaps.

## Draft Plans (GBP/month, per Organisation, to be tuned)

|                                                   | Free  | Starter (~£19) | Pro (~£79) | Enterprise    |
| ------------------------------------------------- | ----- | -------------- | ---------- | ------------- |
| Maps                                              | 1     | 1              | 5          | ∞             |
| Buildings / Levels                                | 1 / 1 | 1 / 5          | ∞          | ∞             |
| Spaces                                            | ~30   | 300            | ∞          | ∞             |
| Listings with logos                               | ✗     | ✓              | ✓          | ✓             |
| Remove badge, brand colours                       | ✗     | ✓              | ✓          | ✓             |
| Basemap / georeference                            | ✗     | ✗              | ✓          | ✓             |
| Search analytics                                  | ✗     | basic          | full       | full + export |
| JS SDK, API, Listing import                       | ✗     | ✗              | ✓          | ✓             |
| Real-time multi-user editing                      | ✗     | ✗              | ✓          | ✓             |
| Wayfinding, SSO, AI tracing beyond free allowance | ✗     | ✗              | add-on     | ✓             |

## Stack

- **Repo**: pnpm + Turborepo monorepo: `apps/{api, editor, embed, web}`, `packages/{domain, geometry, publish, ui}`. A `platform` package splits out when the second suite app arrives.

- **Editor**: React + react-konva + Vite single-page app, TanStack Router/Query, Zustand. Every edit goes through the Operation layer (undo/redo, path to multiplayer).
- **Embed**: separate small Vite bundle (MapLibre GL + vanilla TS or Preact), delivered as an iframe with deep-link URL parameters.
- **Marketing site**: Astro.
- **API**: Fastify + Drizzle on Postgres (Neon). No PostGIS yet.
- **Auth**: Better Auth (organisations, roles, SSO later).
- **Billing**: Stripe Billing + Stripe Tax, kept behind the platform layer.
- **Storage/CDN**: Cloudflare R2 for Underlays and Published Version bundles.
- **Jobs**: pg-boss (PDF rendering, publishing, later AI tracing).
- **Hosting**: Fly.io or Railway, in a UK/EU region.
