import { describe, expect, it } from "vitest";
import { testApp } from "./test/harness.ts";

describe("GET /health", () => {
	it("reports ok", async () => {
		const { app } = await testApp();
		const response = await app.inject({ method: "GET", url: "/health" });

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: "ok" });
	});
});
