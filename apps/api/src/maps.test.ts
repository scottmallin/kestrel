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
});
