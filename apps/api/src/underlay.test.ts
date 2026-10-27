import { describe, expect, it } from "vitest";
import { testApp } from "./test/harness.ts";

// The 8-byte PNG signature is enough for a stored-and-returned check.
const png = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

async function mapWithLevel() {
	const harness = await testApp();
	const owner = await harness.signUp("Trafford");
	const map = (
		await owner.request("POST", "/api/maps", { name: "Main mall" })
	).json();
	const levelId: string = map.levels[0].id;
	return { ...harness, owner, map, levelId };
}

describe("Underlay", () => {
	it("stores an uploaded floor plan on a Level and serves it back", async () => {
		const { owner, map, levelId } = await mapWithLevel();

		const uploaded = await owner.upload(
			`/api/levels/${levelId}/underlay`,
			png,
			"image/png",
		);
		expect(uploaded.statusCode).toBe(204);

		const details = (await owner.request("GET", `/api/maps/${map.id}`)).json();
		expect(details.levels[0]).toMatchObject({
			id: levelId,
			underlay: { pixelsPerMetre: 20 },
		});

		const served = await owner.request(
			"GET",
			`/api/levels/${levelId}/underlay`,
		);
		expect(served.statusCode).toBe(200);
		expect(served.headers["content-type"]).toBe("image/png");
		expect(served.rawPayload).toEqual(png);
		expect(served.headers["x-content-type-options"]).toBe("nosniff");
	});

	it("only accepts PNG, JPEG and WebP images", async () => {
		const { owner, levelId } = await mapWithLevel();
		const svg = Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
		);
		expect(
			(
				await owner.upload(
					`/api/levels/${levelId}/underlay`,
					svg,
					"image/svg+xml",
				)
			).statusCode,
		).toBe(415);
		expect(
			(await owner.upload(`/api/levels/${levelId}/underlay`, png, "text/plain"))
				.statusCode,
		).toBe(415);
	});

	it("keeps other Organisations away from a Level's floor plan", async () => {
		const { owner, levelId, signUp } = await mapWithLevel();
		await owner.upload(`/api/levels/${levelId}/underlay`, png, "image/png");
		const outsider = await signUp("Oxford");

		expect(
			(
				await outsider.upload(
					`/api/levels/${levelId}/underlay`,
					png,
					"image/png",
				)
			).statusCode,
		).toBe(404);
		expect(
			(await outsider.request("GET", `/api/levels/${levelId}/underlay`))
				.statusCode,
		).toBe(404);
	});
});
