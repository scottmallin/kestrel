import { defineConfig } from "vite";

export default defineConfig({
	// Pre-bundling breaks the path MapLibre uses to load its rendering worker.
	optimizeDeps: { exclude: ["maplibre-gl"] },
	// MapLibre's worker is an ES module.
	worker: { format: "es" },
	server: {
		port: 5174,
		// In development the Embed reads published maps through the API, as it will from the CDN in production.
		proxy: { "/api": process.env.API_URL ?? "http://localhost:3000" },
	},
});
