import type { Operation, Space } from "@kestrel/domain";
import { describe, expect, it } from "vitest";
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
		expect(await load()).toEqual({ seq: 0, draft: { spaces: {} } });
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
			draft: { spaces: { a: box("a", 0), b: box("b", 10) } },
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
		expect(await load()).toEqual({ seq: 0, draft: { spaces: {} } });
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
		expect(await load()).toEqual({ seq: 0, draft: { spaces: {} } });
	});
});
