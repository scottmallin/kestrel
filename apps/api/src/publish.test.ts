import type { Operation, Space } from "@kestrel/domain";
import { describe, expect, it } from "vitest";
import { testApp } from "./test/harness.ts";

const unit = (
	id: string,
	x: number,
	reference: string,
	levelId: string,
): Space => ({
	id,
	levelId,
	kind: "unit",
	reference,
	outline: [
		{ x, y: 0 },
		{ x: x + 10, y: 0 },
		{ x: x + 10, y: 8 },
		{ x, y: 8 },
	],
});

async function mapWithDraft() {
	const harness = await testApp();
	const owner = await harness.signUp("Trafford");
	const map = (
		await owner.request("POST", "/api/maps", { name: "Main mall" })
	).json();
	const levelId: string = map.levels[0].id;
	let seq = 0;
	const save = async (...operations: Operation[]) => {
		seq = (
			await owner.request("POST", `/api/maps/${map.id}/operations`, {
				baseSeq: seq,
				operations,
			})
		).json().seq;
	};
	const publish = () => owner.request("POST", `/api/maps/${map.id}/publish`);
	const visit = (embedId: string) =>
		harness.app.inject({ method: "GET", url: `/api/public/embeds/${embedId}` });
	return { ...harness, owner, map, levelId, save, publish, visit };
}

describe("Publishing", () => {
	it("publishes the saved Draft, and anyone can load it through the Embed", async () => {
		const { save, publish, visit, levelId } = await mapWithDraft();
		await save(
			{ type: "addSpace", space: unit("a", 0, "Unit 1", levelId) },
			{
				type: "addListing",
				listing: { id: "boots", name: "Boots", spaceIds: ["a"] },
			},
		);

		const published = await publish();
		expect(published.statusCode).toBe(200);
		const { version, embedId } = published.json();
		expect(version).toBe(1);

		const visitor = await visit(embedId);
		expect(visitor.statusCode).toBe(200);
		expect(visitor.json()).toMatchObject({
			map: { name: "Main mall" },
			version: 1,
			directory: [{ id: "boots", label: "Boots", spaceIds: ["a"] }],
		});
		expect(visitor.headers["access-control-allow-origin"]).toBe("*");
		expect(visitor.headers["cache-control"]).toMatch(/public/);
	});

	it("serves the newest version after publishing again, through the same Embed", async () => {
		const { save, publish, visit, levelId } = await mapWithDraft();
		await save(
			{ type: "addSpace", space: unit("a", 0, "Unit 1", levelId) },
			{
				type: "addListing",
				listing: { id: "boots", name: "Boots", spaceIds: ["a"] },
			},
		);
		const first = (await publish()).json();
		await save(
			{ type: "addSpace", space: unit("b", 10, "Unit 2", levelId) },
			{
				type: "addListing",
				listing: { id: "zara", name: "Zara", spaceIds: ["b"] },
			},
		);

		const second = (await publish()).json();

		expect(second).toEqual({ version: 2, embedId: first.embedId });
		expect(
			(await visit(first.embedId))
				.json()
				.directory.map((d: { label: string }) => d.label),
		).toEqual(["Boots", "Zara"]);
	});

	it("shows the Map's Embeds and latest Published Version to its Organisation", async () => {
		const { owner, map, publish } = await mapWithDraft();
		expect(
			(await owner.request("GET", `/api/maps/${map.id}`)).json(),
		).toMatchObject({ published: null, embeds: [] });

		const { embedId } = (await publish()).json();

		expect(
			(await owner.request("GET", `/api/maps/${map.id}`)).json(),
		).toMatchObject({
			published: { version: 1 },
			embeds: [{ id: embedId }],
		});
	});

	it("keeps publishing to the Map's Organisation, and unknown Embeds don't exist", async () => {
		const { map, signUp, visit, app } = await mapWithDraft();
		const outsider = await signUp("Oxford");

		expect(
			(await outsider.request("POST", `/api/maps/${map.id}/publish`))
				.statusCode,
		).toBe(404);
		expect(
			(await app.inject({ method: "POST", url: `/api/maps/${map.id}/publish` }))
				.statusCode,
		).toBe(401);
		expect(
			(await visit("6f1c2a52-0000-4000-8000-000000000000")).statusCode,
		).toBe(404);
		expect((await visit("not-a-uuid")).statusCode).toBe(404);
	});
});
