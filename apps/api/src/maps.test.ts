import { describe, expect, it } from "vitest";
import { testApp } from "./test/harness.ts";

describe("Maps", () => {
	it("creates a Map with a ground floor Level, listed for its Organisation", async () => {
		const { signUp } = await testApp();
		const scott = await signUp("Trafford");

		const created = await scott.request("POST", "/api/maps", {
			name: "Main mall",
		});
		expect(created.statusCode).toBe(201);
		const map = created.json();
		expect(map).toMatchObject({
			name: "Main mall",
			levels: [{ name: "Ground floor", ordinal: 0 }],
		});

		const list = await scott.request("GET", "/api/maps");
		expect(list.json()).toEqual([{ id: map.id, name: "Main mall" }]);
	});

	it("keeps each Organisation's Maps to itself", async () => {
		const { signUp } = await testApp();
		const trafford = await signUp("Trafford");
		const oxford = await signUp("Oxford");
		const map = (
			await trafford.request("POST", "/api/maps", { name: "Main mall" })
		).json();

		expect((await oxford.request("GET", "/api/maps")).json()).toEqual([]);
		expect(
			(await oxford.request("GET", `/api/maps/${map.id}/draft`)).statusCode,
		).toBe(404);
	});

	it("refuses requests from people who aren't signed in", async () => {
		const { app } = await testApp();
		const response = await app.inject({ method: "GET", url: "/api/maps" });
		expect(response.statusCode).toBe(401);
	});
});
