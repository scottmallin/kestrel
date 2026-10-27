import { defineConfig } from "@playwright/test";

const API_PORT = 3101;
const EDITOR_PORT = 5175;

export default defineConfig({
	testDir: "e2e",
	testMatch: "**/*.e2e.ts",
	fullyParallel: true,
	use: {
		baseURL: `http://localhost:${EDITOR_PORT}`,
		// Uses the installed Edge, so no browser download is needed.
		channel: "msedge",
		viewport: { width: 1600, height: 1000 },
	},
	webServer: [
		{
			// A throwaway API: in-memory database and file store, fresh for each run.
			command: "node ../api/src/server.ts",
			url: `http://localhost:${API_PORT}/health`,
			env: {
				PORT: String(API_PORT),
				KESTREL_EPHEMERAL: "1",
				AUTH_SECRET: "e2e-secret-at-least-32-characters-long",
				TRUSTED_ORIGINS: `http://localhost:${EDITOR_PORT}`,
			},
		},
		{
			command: `pnpm exec vite --port ${EDITOR_PORT} --strictPort`,
			url: `http://localhost:${EDITOR_PORT}`,
			env: { API_URL: `http://localhost:${API_PORT}` },
			reuseExistingServer: true,
		},
	],
});
