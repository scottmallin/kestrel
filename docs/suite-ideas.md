# Suite & value-add ideas

A parking lot for future products and paid features. Nothing here is committed.

## Mapping product: future paid features

- **Wayfinding**: turn-by-turn routes across Levels and Buildings, built on a navigation network (doors, corridors, stairs, lifts). Could be AI-generated from the drawn Spaces.
- **Real-time multi-user editing**: higher paid tiers only (v1 has one editor at a time with a soft lock).
- **AI tracing**: auto-trace and label Spaces from an Underlay.
- **Version history & rollback** of Published Versions.
- **Hand-off to external navigation**: "Get directions" deep-links to Google/Apple Maps for a Building's entrance (needs a georeference, see ADR 0001).
- **Listing sync**: import Listings from CSV or a tenant/CMS system via the API.

## Suite: future apps sharing the Platform (Organisations, users, billing, features each plan unlocks)

Each of these reuses the same drawn Maps. That's the real lock-in: venue staff draw their premises once, and every app builds on it.

- **Kiosk / digital signage**: touchscreen directory mode for in-venue screens, with a fixed "you are here". Same viewer, different shell.
- **Evacuation & fire plans**: generate printable, standards-styled fire/evacuation plans per Level from the map (UK venues must display these). Very sellable compliance angle.
- **Leasing / vacancy map**: show vacant Spaces with size, rent and enquiry forms, for shopping-centre leasing teams and prospective tenants.
- **Room & desk booking**: book Spaces (meeting rooms, desks, study rooms) directly on the map.
- **Facilities reporting**: QR codes per Space ("report a broken light in Room 2.14"), creating jobs for the facilities team.
- **Events & temporary layouts**: exhibition stands, freshers' fairs, Christmas markets drawn as a temporary layer over a Level.
- **QR "you are here" posters**: printable posters that open the Embed centred on that spot.
- **Footfall / occupancy**: combine sensor or Wi-Fi data with Spaces for heatmaps. Higher enterprise end.

## Architecture note

When a second app arrives, split a thin `platform` package (Organisations, users, sign-in, billing, which features each plan unlocks) from the `maps` app in a pnpm/Turborepo monorepo. Until then, just keep plan and billing checks out of map code.
