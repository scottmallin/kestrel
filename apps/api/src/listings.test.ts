import type { Operation, Space } from "@kestrel/domain";
import { describe, expect, it } from "vitest";
import { testApp } from "./test/harness.ts";

const png = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9,
]);

async function setUp() {
	const harness = await testApp();
	const owner = await harness.signUp("Trafford");
	const map = (
		await owner.request("POST", "/api/maps", { name: "Main mall" })
	).json();
	const levelId: string = map.levels[0].id;
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
	const unit = (id: string, x: number): Space => ({
		id,
		levelId,
		kind: "unit",
		outline: [
			{ x, y: 0 },
			{ x: x + 10, y: 0 },
			{ x: x + 10, y: 8 },
		],
	});
	return { ...harness, owner, map, save, unit };
}

describe("Categories", () => {
	it("are created, renamed, listed and deleted within the Organisation", async () => {
		const { owner, signUp } = await setUp();

		const created = await owner.request("POST", "/api/categories", {
			name: "Fashion",
		});
		expect(created.statusCode).toBe(201);
		const { id } = created.json();
		expect(
			(
				await owner.request("PATCH", `/api/categories/${id}`, {
					name: "Clothing",
				})
			).statusCode,
		).toBe(200);
		expect((await owner.request("GET", "/api/categories")).json()).toEqual([
			{ id, name: "Clothing" },
		]);

		const outsider = await signUp("Oxford");
		expect((await outsider.request("GET", "/api/categories")).json()).toEqual(
			[],
		);
		expect(
			(
				await outsider.request("PATCH", `/api/categories/${id}`, {
					name: "Mine",
				})
			).statusCode,
		).toBe(404);
		expect(
			(await outsider.request("DELETE", `/api/categories/${id}`)).statusCode,
		).toBe(404);

		expect(
			(await owner.request("DELETE", `/api/categories/${id}`)).statusCode,
		).toBe(204);
		expect((await owner.request("GET", "/api/categories")).json()).toEqual([]);
	});

	it("need a name, unique within the Organisation", async () => {
		const { owner } = await setUp();
		expect(
			(await owner.request("POST", "/api/categories", { name: " " }))
				.statusCode,
		).toBe(400);
		await owner.request("POST", "/api/categories", { name: "Food" });
		expect(
			(await owner.request("POST", "/api/categories", { name: "food" }))
				.statusCode,
		).toBe(409);
	});
});

describe("Logos", () => {
	it("are uploaded for a Map and served to anyone", async () => {
		const { owner, map, app } = await setUp();

		const uploaded = await owner.upload(
			`/api/maps/${map.id}/logos`,
			png,
			"image/png",
		);
		expect(uploaded.statusCode).toBe(201);
		const { logoKey } = uploaded.json();

		const served = await app.inject({
			method: "GET",
			url: `/api/public/${logoKey}`,
		});
		expect(served.statusCode).toBe(200);
		expect(served.rawPayload).toEqual(png);
		expect(served.headers["access-control-allow-origin"]).toBe("*");
		expect(served.headers["x-content-type-options"]).toBe("nosniff");
	});

	it("never serves anything but logos, such as a private floor plan", async () => {
		const { owner, map, app } = await setUp();
		const levelId = map.levels[0].id;
		await owner.upload(
			`/api/maps/${map.id}/levels/${levelId}/underlay`,
			png,
			"image/png",
		);

		for (const url of [
			`/api/public/logos/../organisations/${owner.organisationId}/levels/${levelId}/underlay`,
			"/api/public/logos/%2e%2e/%2e%2e/package.json",
			`/api/public/logos/${owner.organisationId}/not-a-uuid.png`,
		]) {
			expect((await app.inject({ method: "GET", url })).statusCode, url).toBe(
				404,
			);
		}
	});

	it("must be PNG, JPEG or WebP", async () => {
		const { owner, map } = await setUp();
		const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
		expect(
			(await owner.upload(`/api/maps/${map.id}/logos`, svg, "image/svg+xml"))
				.statusCode,
		).toBe(415);
	});
});

describe("Listings", () => {
	it("are saved as Operations and loaded back with the Draft", async () => {
		const { owner, map, save, unit } = await setUp();
		await save({ type: "addSpace", space: unit("s1", 0) });
		await save({
			type: "addListing",
			listing: { id: "boots", name: "Boots", spaceIds: ["s1"] },
		});

		const { draft } = (
			await owner.request("GET", `/api/maps/${map.id}/draft`)
		).json();
		expect(draft.listings).toEqual({
			boots: { id: "boots", name: "Boots", spaceIds: ["s1"] },
		});
	});

	it("refuse a website that isn't an http(s) address", async () => {
		const { save } = await setUp();
		const response = await save({
			type: "addListing",
			listing: {
				id: "x",
				name: "X",
				spaceIds: [],
				website: "javascript:alert(1)",
			},
		});
		expect(response.statusCode).toBe(400);
	});

	it("reach the public Embed with their Category and logo", async () => {
		const { owner, map, save, unit, app } = await setUp();
		const category = (
			await owner.request("POST", "/api/categories", {
				name: "Health & beauty",
			})
		).json();
		const { logoKey } = (
			await owner.upload(`/api/maps/${map.id}/logos`, png, "image/png")
		).json();
		await save(
			{ type: "addSpace", space: unit("s1", 0) },
			{
				type: "addListing",
				listing: {
					id: "boots",
					name: "Boots",
					categoryId: category.id,
					spaceIds: ["s1"],
					logoKey,
				},
			},
			{ type: "addListing", listing: { id: "hmv", name: "HMV", spaceIds: [] } },
		);

		const { embedId } = (
			await owner.request("POST", `/api/maps/${map.id}/publish`)
		).json();
		const bundle = (
			await app.inject({ method: "GET", url: `/api/public/embeds/${embedId}` })
		).json();

		expect(bundle.listings).toEqual([
			{
				id: "boots",
				name: "Boots",
				categoryId: category.id,
				spaceIds: ["s1"],
				logoUrl: `http://localhost/api/public/${logoKey}`,
			},
		]);
		expect(bundle.categories).toEqual([
			{ id: category.id, name: "Health & beauty" },
		]);
		expect(bundle.directory.map((e: { label: string }) => e.label)).toEqual([
			"Boots",
		]);
	});
});
