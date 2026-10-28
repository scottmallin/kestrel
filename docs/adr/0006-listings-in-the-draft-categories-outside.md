# 6. Listings live in the Draft; Categories live outside it

Date: 2026-10-28

## Status

Accepted

## Context

Listings (the shops, departments and facilities Visitors search for) and Categories (an Organisation's groupings of them) both need storing. Listings change often, are placed on Spaces, and must be captured in each Published Version together with geometry. Categories are shared across all of an Organisation's Maps, and a university with several Maps wants one shared set.

## Decision

- **Listings are part of a Map's Draft**, changed only by Operations (`addListing`, `updateListing`, `removeListing`) like Spaces (ADR 0004), and saved in the same Operation log (ADR 0005). Undo, saving, conflicts and publishing therefore work for Listings with no new machinery. A Published Version captures geometry and Listings together.
- **A Listing keeps the ids of the Spaces it's placed in, even when one disappears.** A Listing is _placed_ if at least one of those Spaces exists in the Draft; otherwise it's an Unplaced Listing. Deleting a Space therefore never touches its Listings, and undoing the delete restores the link automatically, because the Space comes back with the same id.
- **Split and merge keep the original Space's id on one piece**: the first piece of a split, and the merged Space (the first selected Space's id). A unit's Listing stays where it was. Listings on the other Spaces of a merge become Unplaced, and the editor makes that visible.
- **Categories are per Organisation**, stored as ordinary rows with their own API routes, outside any Draft. Undo doesn't cover them. A Listing refers to its Category by id. A Category that no longer exists is treated as "no Category" when compiling, so Categories can be deleted without scanning every Map's Draft.
- **Logos are public files** stored through the `Storage` interface (square PNG, at most 256 px, converted in the browser). They are referenced from Listings by key and served from a public route, since Visitors see them.

## Consequences

- Listing-only publishing (a later premium feature) can compile the current Listings against the last published geometry.
- Listings may hold ids of Spaces that no longer exist. Every reader (the editor, `compileBundle`) must treat only existing Spaces as placements.
- Renaming a Category changes every Map that uses it, including what the next publish shows, but not what's already published.
