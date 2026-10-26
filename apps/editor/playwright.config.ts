import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "e2e",
	testMatch: "**/*.e2e.ts",
	fullyParallel: true,
	use: {
		baseURL: "http://localhost:5175",
		// Uses the installed Edge, so no browser download is needed.
		channel: "msedge",
		viewport: { width: 1600, height: 1000 },
	},
	webServer: {
		command: "pnpm exec vite --port 5175 --strictPort",
		url: "http://localhost:5175",
		reuseExistingServer: true,
	},
});
