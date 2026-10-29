# 7. Levels live in the Draft; Underlays live outside it

Date: 2026-10-29

## Status

Accepted

## Context

Until now a Map had exactly one Level, a database row the API created ("Ground floor") with the Underlay's storage key on it. Spaces sit in the Draft and point at their Level by `levelId`. The alpha needs several Levels per Map: added, renamed, reordered and removed in the editor, and switchable in the Embed.

ADR 0004 already expected that "new Draft contents (Levels, Listings, Amenities) need their own Operations". The open question was whether a Level is Draft content or an ordinary row like a Category (ADR 0006).

## Decision

- **Levels are part of a Map's Draft**, changed only by Operations and saved in the same Operation log (ADR 0005). Renaming, reordering and removing a Level can be undone, conflict like any other edit, and only reach an Embed when the Map is published.
- **The Operations** are `addLevel`, `updateLevel` (its name), `reorderLevels` (new ordinals for several Levels at once, so a swap is one step) and `removeLevel`.
- **Ordinals are floor numbers.** The ground floor is 0, Levels above it are positive and basements are negative. Ordinals are whole numbers, unique within a Map; gaps are allowed. The Embed opens on the Level closest to 0.
- **Removing a Level removes its Spaces with it.** The inverse is an `addLevel` that carries those Spaces back. Listings keep their Space ids (ADR 0006), so undoing the removal places them again. The editor warns before removing a Level that has Spaces. A Map always keeps at least one Level.
- **A Space must be on a Level that exists** when it's added or replaced.
- **Underlays (and, later, Alignment and scale) stay outside the Draft**, as rows keyed by Map and Level id. They are editor-only, never published (ADR 0003 amendment), and uploading a file is a side effect that undo can't reverse. Alignment and scale only change how an Underlay sits on the Building's plane, never the Spaces, so the Draft doesn't need them.
- **One implicit Building in the alpha.** Levels carry no Building id yet; one arrives with multiple Buildings in the beta, with a default for older Operations.
- **Existing Maps are migrated** by storing a snapshot at sequence number 0 holding each Map's existing Level (same id), and adding it to any snapshots already stored, so their logs replay unchanged. A new Map's log starts with an `addLevel` for its Ground floor.

## Consequences

- Levels get undo, saving, conflicts and publishing with no new machinery, and a Published Version always has matching Levels and Spaces.
- A Level's Underlay row may outlive the Level (after a removal, ready for undo). Nothing reads an Underlay without a Level, so it's harmless; clean-up can come later.
- Removing a busy Level makes a large inverse Operation (every Space's outline). That's fine at the scale of a venue.
- Plan limits on Levels (Starter: 5) are not enforced in the alpha.
- Alignment is a separate step, alongside scale-setting, since the first Level's scale defines the Building's plane (ADR 0001 amendment).
