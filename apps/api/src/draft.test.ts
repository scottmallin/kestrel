import type { Operation, Space } from "@kestrel/domain";
import { describe, expect, it } from "vitest";
import { draftSnapshots } from "./db/schema.ts";
import { testApp } from "./test/harness.ts";

const box = (id: string, x: number): Space => ({
	id,
	levelId: "level-1",
	kind: "unit",
	outline: [
		{ x, y: 0 },
		{ x: x + 10, y: 0 },
		{ x: x + 10, y: 8 },
		{ x, y: 8 },
	],
});

async function newMap() {
	const harness = await testApp();
	const owner = await harness.signUp("Trafford");
	const map = (
		await owner.request("POST", "/api/maps", { name: "Main mall" })
	).json<{ id: string }>();
	const save = (baseSeq: number, operations: Operation[]) =>
		owner.request("POST", `/api/maps/${map.id}/operations`, {
			baseSeq,
			operations,
		});
	const load = async () =>
		(await owner.request("GET", `/api/maps/${map.id}/draft`)).json();
	return { ...harness, owner, map, save, load };
}

describe("Draft", () => {
	it("starts empty", async () => {
		const { load } = await newMap();
		expect(await load()).toEqual({
			seq: 0,
			draft: { spaces: {}, listings: {} },
		});
	});

	it("saves Operations and loads them back", async () => {
		const { save, load } = await newMap();

		const saved = await save(0, [
			{ type: "addSpace", space: box("a", 0) },
			{ type: "addSpace", space: box("b", 10) },
		]);
		expect(saved.statusCode).toBe(200);
		expect(saved.json()).toEqual({ seq: 2 });

		expect(await load()).toEqual({
			seq: 2,
			draft: { spaces: { a: box("a", 0), b: box("b", 10) }, listings: {} },
		});
	});

	it("rejects a save based on an out-of-date Draft, so a second tab can't overwrite the first", async () => {
		const { save, load } = await newMap();
		await save(0, [{ type: "addSpace", space: box("a", 0) }]);

		const stale = await save(0, [{ type: "addSpace", space: box("b", 10) }]);

		expect(stale.statusCode).toBe(409);
		expect(stale.json()).toMatchObject({ seq: 1 });
		expect(Object.keys((await load()).draft.spaces)).toEqual(["a"]);
	});

	it("rejects Operations that don't apply, saving none of the batch", async () => {
		const { save, load } = await newMap();

		const invalid = await save(0, [
			{ type: "addSpace", space: box("a", 0) },
			{ type: "removeSpaces", ids: ["ghost"] },
		]);

		expect(invalid.statusCode).toBe(422);
		expect(invalid.json()).toEqual({
			error: "Operation 2: No Space with id ghost",
		});
		expect(await load()).toEqual({
			seq: 0,
			draft: { spaces: {}, listings: {} },
		});
	});

	it("refuses malformed requests without touching the Draft", async () => {
		const { owner, map, load } = await newMap();
		const post = (payload: object) =>
			owner.request("POST", `/api/maps/${map.id}/operations`, payload);

		for (const payload of [
			{ operations: [] },
			{ baseSeq: 0, operations: "nope" },
			{ baseSeq: 0, operations: [{ type: "addSpace" }] },
			{
				baseSeq: 0,
				operations: [
					{
						type: "addSpace",
						space: { ...box("a", 0), outline: [{ x: "1", y: 0 }] },
					},
				],
			},
			{ baseSeq: 0, operations: [{ type: "dropTables" }] },
		]) {
			expect((await post(payload)).statusCode, JSON.stringify(payload)).toBe(
				400,
			);
		}
		expect(await load()).toEqual({
			seq: 0,
			draft: { spaces: {}, listings: {} },
		});
	});

	it("keeps loading the right Draft once snapshots are taken", async () => {
		const { save, load, db } = await newMap();
		// 130 edits in batches of 10: add a Space, then keep widening it.
		let seq = 0;
		let width = 10;
		for (let batch = 0; batch < 13; batch++) {
			const operations: Operation[] = [];
			for (let i = 0; i < 10; i++) {
				if (seq === 0 && i === 0)
					operations.push({ type: "addSpace", space: box("a", 0) });
				else {
					width++;
					operations.push({
						type: "reshapeSpace",
						id: "a",
						outline: box("a", 0).outline.map((p) =>
							p.x > 0 ? { ...p, x: width } : p,
						),
					});
				}
			}
			seq = (await save(seq, operations)).json().seq;
		}

		expect(await db.select().from(draftSnapshots)).not.toHaveLength(0);
		const loaded = await load();
		expect(loaded.seq).toBe(130);
		expect(loaded.draft.spaces.a.outline).toContainEqual({ x: 139, y: 8 });
	});
});
