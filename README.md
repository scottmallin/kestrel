# Kestrel

Self-serve indoor maps for venues: draw your premises, embed the map on your website.

Start with [GLOSSARY.md](GLOSSARY.md) for the domain language, [docs/roadmap.md](docs/roadmap.md) for product decisions and [docs/adr/](docs/adr/) for architecture decisions.

## Layout

| Path                | What                                             |
| ------------------- | ------------------------------------------------ |
| `apps/api`          | Fastify + Drizzle API (Postgres)                 |
| `apps/editor`       | React + react-konva map editor                   |
| `apps/embed`        | MapLibre viewer served as the Embed              |
| `apps/web`          | Astro marketing site                             |
| `packages/domain`   | Domain types and Operations                      |
| `packages/geometry` | Polygon maths and snapping                       |
| `packages/publish`  | Compiles a Draft into a Published Version bundle |
| `packages/ui`       | Shared React components                          |

Workspace packages are consumed as TypeScript source; there is no separate build step for them.

## Commands

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev         # all apps in watch mode
pnpm typecheck
pnpm test        # unit tests (Vitest)
pnpm e2e         # browser tests (Playwright, uses the installed Microsoft Edge)
pnpm build
pnpm check       # Biome lint + format check (pnpm format to fix)
```

The API reads `apps/api/.env` (copy `.env.example`).
