import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Level, Operation, Space } from "@kestrel/domain";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { loadDraft } from "./draft.ts";
import { testApp } from "./test/harness.ts";

const png = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 4, 5, 6,
]);

const first: Level = { id: "first-floor", name: "First floor", ordinal: 1 };

const unit = (id: string, levelId: string): Space => ({
	id,
	levelId,
	kind: "unit",
	outline: [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 8 },
	],
});

async function newMap() {
	const harness = await testApp();
	const owner = await harness.signUp("Trafford");
	const map = (
		await owner.request("POST", "/api/maps", { name: "Main mall" })
	).json();
	const groundId: string = map.levels[0].id;
	let seq = 0;
	const save = async (...operations: Operation[]) => {
		const response = await owner.request(
			"POST",
			`/api/maps/${map.id}/operations`,
			{ baseSeq: seq, operations },
		);
		if (response.statusCode === 200) seq = response.json().seq;
		return response;
	};
	const load = async () =>
		(await owner.request("GET", `/api/maps/${map.id}/draft`)).json();
	return { ...harness, owner, map, groundId, save, load };
}

describe("Levels", () => {
	it("a new Map's Draft starts with a ground floor", async () => {
		const { map, groundId, load } = await newMap();

		expect(map.levels).toEqual([
			{ id: groundId, name: "Ground floor", ordinal: 0 },
		]);
		expect(await load()).toEqual({
			seq: 0,
			draft: {
				levels: {
					[groundId]: { id: groundId, name: "Ground floor", ordinal: 0 },
				},
				spaces: {},
				listings: {},
			},
		});
	});

	it("are added, renamed, reordered and removed through saved Operations", async () => {
		const { groundId, save, load } = await newMap();

		expect(
			(
				await save(
					{ type: "addLevel", level: first },
					{ type: "addSpace", space: unit("a", first.id) },
					{
						type: "updateLevel",
						id: groundId,
						changes: { name: "Lower mall" },
					},
					{
						type: "reorderLevels",
						ordinals: { [groundId]: -1, [first.id]: 0 },
					},
				)
			).statusCode,
		).toBe(200);
		const { draft } = await load();
		expect(draft.levels).toEqual({
			[groundId]: { id: groundId, name: "Lower mall", ordinal: -1 },
			[first.id]: { ...first, ordinal: 0 },
		});
		expect(Object.keys(draft.spaces)).toEqual(["a"]);

		await save({ type: "removeLevel", id: first.id });
		const after = (await load()).draft;
		expect(Object.keys(after.levels)).toEqual([groundId]);
		expect(after.spaces).toEqual({});
	});

	it("rejects a Space on a Level the Draft doesn't have", async () => {
		const { save } = await newMap();
		const rejected = await save({
			type: "addSpace",
			space: unit("a", "nowhere"),
		});
		expect(rejected.statusCode).toBe(422);
	});

	it("rejects Level ids that aren't safe to use in a storage key", async () => {
		const { save } = await newMap();
		const rejected = await save({
			type: "addLevel",
			level: { ...first, id: "../../etc" },
		});
		expect(rejected.statusCode).toBe(400);
	});
});

describe("Underlays per Level", () => {
	it("can be uploaded for any Level in the Draft, and are listed with the Map", async () => {
		const { owner, map, save } = await newMap();
		await save({ type: "addLevel", level: first });

		const url = `/api/maps/${map.id}/levels/${first.id}/underlay`;
		expect((await owner.upload(url, png, "image/png")).statusCode).toBe(204);

		const details = (await owner.request("GET", `/api/maps/${map.id}`)).json();
		expect(details.underlays).toEqual({ [first.id]: { pixelsPerMetre: 20 } });
		const served = await owner.request("GET", url);
		expect(served.statusCode).toBe(200);
		expect(served.rawPayload).toEqual(png);
	});

	it("can't be uploaded for a Level the Draft doesn't have", async () => {
		const { owner, map } = await newMap();
		const url = `/api/maps/${map.id}/levels/${first.id}/underlay`;
		expect((await owner.upload(url, png, "image/png")).statusCode).toBe(404);
	});
});

describe("Publishing Levels", () => {
	it("publishes the Draft's Levels in floor order, without removed ones or their Spaces", async () => {
		const { owner, map, groundId, save, app } = await newMap();
		const basement: Level = { id: "basement", name: "Car park", ordinal: -1 };
		await save(
			{ type: "addLevel", level: first },
			{ type: "addLevel", level: basement },
			{ type: "addSpace", space: unit("a", first.id) },
			{ type: "addSpace", space: unit("b", basement.id) },
			{ type: "removeLevel", id: first.id },
		);

		const { embedId } = (
			await owner.request("POST", `/api/maps/${map.id}/publish`)
		).json();
		const bundle = (
			await app.inject({ method: "GET", url: `/api/public/embeds/${embedId}` })
		).json();

		expect(bundle.levels).toEqual([
			basement,
			{ id: groundId, name: "Ground floor", ordinal: 0 },
		]);
		expect(
			bundle.spaces.features.map(
				(f: { properties: { id: string } }) => f.properties.id,
			),
		).toEqual(["b"]);
	});
});

describe("Maps made before Levels moved into the Draft (ADR 0007)", () => {
	it("still load with their Level, Spaces and Underlay", async () => {
		const migrations = fileURLToPath(new URL("../drizzle", import.meta.url));
		// Migrate a database only as far as 0002, as it stood before this change.
		const old = mkdtempSync(join(tmpdir(), "kestrel-migrations-"));
		cpSync(migrations, old, { recursive: true });
		const journalPath = join(old, "meta", "_journal.json");
		const journal = JSON.parse(readFileSync(journalPath, "utf8"));
		journal.entries = journal.entries.filter(
			(e: { idx: number }) => e.idx <= 2,
		);
		writeFileSync(journalPath, JSON.stringify(journal));
		const db = drizzle(new PGlite());
		await migrate(db, { migrationsFolder: old });

		const mapId = "00000000-0000-4000-8000-000000000001";
		const levelId = "00000000-0000-4000-8000-0000000000a1";
		await db.execute(
			sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('u1', 'Scott', 'scott@example.com', false, now(), now())`,
		);
		await db.execute(
			sql`insert into organization (id, name, slug, created_at) values ('o1', 'Trafford', 'trafford', now())`,
		);
		await db.execute(
			sql`insert into map (id, organization_id, name) values (${mapId}, 'o1', 'Main mall')`,
		);
		await db.execute(
			sql`insert into level (id, map_id, name, ordinal, underlay_key, underlay_pixels_per_metre) values (${levelId}, ${mapId}, 'Ground floor', 0, 'organisations/o1/levels/x/underlay-1', 20)`,
		);
		const space = unit("s1", levelId);
		await db.execute(
			sql`insert into draft_operation (map_id, seq, operation, author_id) values (${mapId}, 1, ${JSON.stringify({ type: "addSpace", space })}::jsonb, 'u1')`,
		);

		// A second Map whose Draft was snapshotted before Levels existed.
		const snapshottedId = "00000000-0000-4000-8000-000000000002";
		const snapshottedLevel = "00000000-0000-4000-8000-0000000000b1";
		await db.execute(
			sql`insert into map (id, organization_id, name) values (${snapshottedId}, 'o1', 'Retail park')`,
		);
		await db.execute(
			sql`insert into level (id, map_id, name, ordinal) values (${snapshottedLevel}, ${snapshottedId}, 'Ground floor', 0)`,
		);
		const oldSnapshot = {
			spaces: { s2: unit("s2", snapshottedLevel) },
			listings: {},
		};
		await db.execute(
			sql`insert into draft_snapshot (map_id, seq, draft) values (${snapshottedId}, 50, ${JSON.stringify(oldSnapshot)}::jsonb)`,
		);

		await migrate(db, { migrationsFolder: migrations });

		const { seq, draft } = await loadDraft(
			// biome-ignore lint/suspicious/noExplicitAny: the migrated database has the current schema.
			db as any,
			mapId,
		);
		expect(seq).toBe(1);
		expect(draft.levels).toEqual({
			[levelId]: { id: levelId, name: "Ground floor", ordinal: 0 },
		});
		expect(draft.spaces).toEqual({ s1: space });
		const snapshotted = await loadDraft(
			// biome-ignore lint/suspicious/noExplicitAny: as above.
			db as any,
			snapshottedId,
		);
		expect(snapshotted.seq).toBe(50);
		expect(Object.keys(snapshotted.draft.levels)).toEqual([snapshottedLevel]);
		expect(Object.keys(snapshotted.draft.spaces)).toEqual(["s2"]);

		const underlays = await db.execute(
			sql`select level_id, storage_key from underlay`,
		);
		expect(underlays.rows).toEqual([
			{
				level_id: levelId,
				storage_key: "organisations/o1/levels/x/underlay-1",
			},
		]);
	});
});
