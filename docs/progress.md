# Progress: pick up here

Last updated: 2026-10-27. Read this first when resuming work, then [GLOSSARY.md](../GLOSSARY.md) for the domain language, [roadmap.md](roadmap.md) for product decisions and [adr/](adr/) for architecture decisions.

## Where we are

We're building the **alpha editor** (see Phases in the roadmap). The plan for it is four steps:

| Step | What                                                                                   | Status                               |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| 1    | Operations and undo/redo in `packages/domain`                                          | ✅ Done (merged)                     |
| 2    | Geometry in `packages/geometry`: snapping, split/merge/overlaps, Magic fill            | ✅ Done (merged)                     |
| 3    | The editor in `apps/editor`: Level canvas and the Box, Magic fill, Split and Pen tools | ✅ Done (merged)                     |
| 4    | Saving: API, database, Underlay upload                                                 | 🚧 In progress on `feat/persistence` |

## What's built

**`packages/domain`**: Operations (`addSpace`, `removeSpaces`, `replaceSpaces`, `reshapeSpace`, `updateSpace`) applied to a Draft by `applyOperation`, which returns the new Draft plus the Operation that reverses it. `History` provides `perform` / `undo` / `redo` on top. See [ADR 0004](adr/0004-operations-record-results-and-undo-by-inverse.md).

**`packages/geometry`**: everything is in metres except `traceRoom`, which works in Underlay pixels.
- `snap`: close the shape, then corner, then edge, then 45°/90° angle plus alignment guides, then grid on whichever axes nothing else has fixed.
- `splitOutline` (only cuts along the segment actually drawn), `mergeOutlines`, `findOverlaps`, `containsPoint`, `polygonArea`.
- `traceRoom`: Magic fill on a wall/not-wall pixel grid, covering door gaps, leak detection, tidying rough walls and treating Spaces already drawn as walls.

**`apps/editor`**: React + react-konva.
- `src/editor/store.ts`: Zustand store over `History`, plus the selection (pruned when Spaces disappear) and the last rejected Operation's error.
- `src/editor/tools/`: one hook per tool, `useBoxTool`, `useFillTool`, `useSplitTool` and `usePenTool`, all built on the `Tool` interface in `tool.ts`. Tools do their own hit-testing with geometry; Konva only draws.
- `LevelCanvas.tsx`: zoom (wheel), pan (Space+drag or middle mouse), and mouse handling through native events, since they carry the real click count (see ADR 0002 findings).
- `Editor.tsx`: toolbar, keyboard shortcuts (B/F/S/P, M, Delete, Ctrl+Z / Ctrl+Shift+Z), status line, and a side panel to edit Space Reference and Space Kind.
- `public/sample-plan.svg`: the "Use sample plan" floor plan, also used by the browser tests.

**`apps/api`, `apps/embed`, `apps/web`, `packages/publish`, `packages/ui`**: scaffolds only.

**`prototype/drawing-tools` branch**: the throwaway prototype comparing Pen, Boxes and Magic fill. Never merge it. The verdict is in the ADR 0002 amendment.

## How to run and check

```sh
pnpm install
pnpm --filter @kestrel/editor dev   # editor at http://localhost:5173 → "Use sample plan"
pnpm check       # Biome lint + format
pnpm typecheck
pnpm test        # Vitest unit tests (55)
pnpm e2e         # Playwright browser tests (8), using the installed Microsoft Edge
```

## How we work

- **One branch per step**, merged by PR. Small commits, each made only once `pnpm check` passes.
- **Test-first at agreed test locations.** Before writing tests for a new area, agree with Scott which public functions to test and what each test catches and misses. Domain and geometry get unit tests through their public functions. The editor gets store unit tests plus browser tests per tool.
- **Prototypes** live on throwaway branches. Only the decision moves to `main`, recorded in an ADR or the roadmap.
- **Terms** come from GLOSSARY.md (Space, Level, Underlay, Draft, Operation…), never their "avoid" synonyms.

## Known gaps

- **Nothing is saved**; refreshing the editor loses the Draft (step 4).
- **Scale is assumed** at 20 Underlay pixels = 1 m (`DEFAULT_PIXELS_PER_METRE`) until the scale-setting step exists.
- **Underlays are images only**; there's no PDF upload yet.
- **One Level only**: Spaces use a fixed `LEVEL_ID`, and there are no Buildings or Levels in the Draft yet.
- **Labels can collide**: Space labels sit at the centre of the bounding box, so they can overlap the plan's own text and fall outside L-shaped Spaces.
- **Pressing inside an existing Space with the Box tool moves it** rather than starting a new box. This is intended, but worth watching in user testing.
- **Magic fill is slow on big plans**, because the wall grid is rebuilt when the darkness slider or closed openings change. That's fine at 2000px; watch it on large plans.

## Now: step 4, saving

Postgres tables for Organisations, Maps, Levels and the Draft; saving Operations as they happen; Underlay upload to Cloudflare R2. Decided on 2026-10-27:

1. **The Draft is saved as a log of Operations with periodic snapshots**, and a stale save is rejected as a conflict. See [ADR 0005](adr/0005-draft-saved-as-operation-log-with-snapshots.md).
2. **Sign-in comes now**: Better Auth with Organisations and roles, so every table carries an Organisation id from the start.
