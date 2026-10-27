import { buildApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { createDb, createPgliteDb } from "./db/client.ts";
import { diskStorage } from "./storage.ts";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.BASE_URL ?? `http://localhost:${port}`;
const secret = process.env.AUTH_SECRET;
if (!secret) throw new Error("Set AUTH_SECRET (see .env.example)");

// Without DATABASE_URL, development runs on PGlite stored in .data/ – no Postgres needed.
const db = process.env.DATABASE_URL
	? await createDb(process.env.DATABASE_URL)
	: await createPgliteDb(".data/pglite");
const auth = createAuth({
	db,
	secret,
	baseURL,
	trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
		.split(",")
		.filter(Boolean),
});
// Uploaded files go to .data/files in development; an R2 adapter comes with deployment.
const app = buildApp(
	{ db, auth, storage: diskStorage(".data/files") },
	{ logger: true },
);

await app.listen({ port, host: "0.0.0.0" });
