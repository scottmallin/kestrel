import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		// The API runs separately; proxying keeps its cookies on the editor's origin.
		proxy: { "/api": process.env.API_URL ?? "http://localhost:3000" },
	},
});
