# Progress: pick up here

Last updated: 2026-10-27. Read this first when resuming work, then [GLOSSARY.md](../GLOSSARY.md) for the domain language, [roadmap.md](roadmap.md) for product decisions and [adr/](adr/) for architecture decisions.

## Where we are

We're building the **alpha editor** (see Phases in the roadmap). The plan for it was four steps:

| Step | What                                                                                   | Status                                     |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1    | Operations and undo/redo in `packages/domain`                                          | ✅ Done (merged)                           |
| 2    | Geometry in `packages/geometry`: snapping, split/merge/overlaps, Magic fill            | ✅ Done (merged)                           |
| 3    | The editor in `apps/editor`: Level canvas and the Box, Magic fill, Split and Pen tools | ✅ Done (merged)                           |
| 4    | Saving: sign-in, API, database, Underlay upload                                        | ✅ Done on `feat/persistence` (PR pending) |

What comes next is open: see [Next](#next) below.

## What's built

**`packages/domain`**: Operations (`addSpace`, `removeSpaces`, `replaceSpaces`, `reshapeSpace`, `updateSpace`) applied to a Draft by `applyOperation`, which returns the new Draft plus the Operation that reverses it. `History` provides `perform` / `undo` / `redo` on top (ADR 0004). `parseOperation` checks that untrusted input is a well-formed Operation.

**`packages/geometry`**: everything is in metres except `traceRoom`, which works in Underlay pixels.
- `snap`: close the shape, then corner, then edge, then 45°/90° angle plus alignment guides, then grid on whichever axes nothing else has fixed.
- `splitOutline` (only cuts along the segment actually drawn), `mergeOutlines`, `findOverlaps`, `containsPoint`, `polygonArea`.
- `traceRoom`: Magic fill on a wall/not-wall pixel grid, covering door gaps, leak detection, tidying rough walls and treating Spaces already drawn as walls.

**`apps/api`**: Fastify + Drizzle + Better Auth.
- Auth at `/api/auth/*`: email and password, plus Organisations (each sign-up creates one). The auth tables in `src/db/auth-schema.ts` mirror Better Auth 1.7's `getAuthTables`; update them when upgrading.
- `GET/POST /api/maps`, `GET /api/maps/:id` (with Levels and their Underlays). A new Map gets a "Ground floor" Level.
- `GET /api/maps/:id/draft` and `POST /api/maps/:id/operations`. The Draft is a log of Operations with a snapshot every 50 (ADR 0005). Saves are rejected with 409 if out of date, 422 if an Operation doesn't apply, and 400 if malformed.
- `PUT/GET /api/levels/:id/underlay`: PNG, JPEG or WebP only, served with `nosniff` and a sandboxing CSP. Files go through the `Storage` interface: memory in tests, `.data/files` in development.
- Every route checks that the user belongs to the Map's Organisation (404 otherwise).
- Database: real Postgres when `DATABASE_URL` is set; otherwise PGlite stored in `.data/pglite`; or entirely in memory with `KESTREL_EPHEMERAL=1` (browser tests). Migrations are in `drizzle/` and run on start.

**`apps/editor`**: React + react-konva.
- `App.tsx` / `screens.tsx`: sign in or sign up, then the Map picker, then the editor. The open Map is kept in the URL (`?map=…`).
- `src/api.ts`: the API client.
- `src/editor/sync.ts`: the save queue. It sends applied Operations in order, batching edits made during a save; goes offline and retries with backoff on network failure; stops on a conflict or rejection.
- `src/editor/store.ts`: Zustand store over `History`, plus the selection and the last rejected Operation's error. It reports every applied Operation (including undo and redo) to the save queue.
- `src/editor/tools/`: one hook per tool, `useBoxTool`, `useFillTool`, `useSplitTool` and `usePenTool`, all built on the `Tool` interface in `tool.ts`. Tools do their own hit-testing with geometry; Konva only draws.
- `LevelCanvas.tsx`: zoom, pan, and mouse handling through native events, since they carry the real click count.
- `Editor.tsx`: toolbar, shortcuts (B/F/S/P, M, Delete, Ctrl+Z / Ctrl+Shift+Z), save status, a conflict banner with Reload, and the side panel for Space Reference and Space Kind. Floor plans are converted to PNG in the browser (`toUploadablePng`) before upload.
- The dev server proxies `/api` to the API (`API_URL`, default `http://localhost:3000`), so cookies stay on the editor's origin.

**`apps/embed`, `apps/web`, `packages/publish`, `packages/ui`**: scaffolds only.

**`prototype/drawing-tools` branch**: the throwaway prototype comparing Pen, Boxes and Magic fill. Never merge it. The verdict is in the ADR 0002 amendment.

## How to run and check

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # first time only
pnpm --filter @kestrel/api dev           # API at http://localhost:3000 (PGlite in apps/api/.data)
pnpm --filter @kestrel/editor dev        # editor at http://localhost:5173 → create an account
pnpm check       # Biome lint + format (run `pnpm format` twice if imports were reordered)
pnpm typecheck
pnpm test        # Vitest unit tests (72)
pnpm e2e         # Playwright browser tests (11) in the installed Microsoft Edge; starts its own API and editor
```

## How we work

- **One branch per step**, merged by PR. Small commits, each made only once `pnpm check` passes.
- **Test-first at agreed test locations.** Before writing tests for a new area, agree with Scott which public functions to test and what each test catches and misses:
  - domain and geometry: unit tests through their public functions;
  - API: real HTTP requests (`app.inject`) against a fresh PGlite database;
  - editor: store and save-queue unit tests, plus browser tests per tool and for saving.
- **Run the real thing**, not just the tests, before calling a step done. It caught the missing PGlite folder in step 4.
- **Prototypes** live on throwaway branches. Only the decision moves to `main`, recorded in an ADR or the roadmap.
- **Terms** come from GLOSSARY.md (Space, Level, Underlay, Draft, Operation…), never their "avoid" synonyms.

## Known gaps

- **No R2 storage adapter yet**: uploads go to the local disk. Write the adapter when we deploy.
- **No deployment**: the API, database and editor haven't been hosted anywhere yet (Fly.io/Railway, Neon, R2).
- **Accounts are minimal**: no email verification, password reset, invitations or Organisation switcher. Sign-in picks your first Organisation.
- **A conflict loses unsaved edits**: the banner reloads the Map. That's fine for one editor at a time (ADR 0005).
- **Cross-site request protection is untested**: Better Auth relaxes its Origin check under Vitest, so only the browser tests (and a manual curl check) exercise it.
- **Scale is assumed** at 20 Underlay pixels = 1 m until the scale-setting step exists. The API stores `underlayPixelsPerMetre` ready for it.
- **Underlays are images only**; there's no PDF upload yet.
- **One Level only**: the editor uses each Map's first Level. There's no way yet to add Levels or switch between them.
- **Labels can collide**: Space labels sit at the centre of the bounding box, so they can overlap the plan's own text and fall outside L-shaped Spaces.
- **Pressing inside an existing Space with the Box tool moves it** rather than starting a new box. This is intended, but worth watching in user testing.
- **Magic fill is slow on big plans**, because the wall grid is rebuilt when the darkness slider or closed openings change.

## Next

The alpha scope in the roadmap still needs, roughly in order:

1. **Levels**: add, rename and reorder Levels, switch between them, and Alignment (pin each Level's Underlay to the one below).
2. **Scale-setting** in onboarding (draw a line, enter its length), replacing the 20 px/m assumption.
3. **Listings + Categories**, placed by clicking Spaces, and Amenities (Lucide icons, including fire-safety ones).
4. **Publishing**: compile the Draft into a Published Version bundle (`packages/publish`), and the first Embed (MapLibre viewer, directory + search, Level switcher).
5. **Deployment** for alpha partners: hosting, Neon, the R2 adapter, and email for account recovery.
6. **PDF Underlays**.
