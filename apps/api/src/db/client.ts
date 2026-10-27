import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.ts";

/** Either driver: real Postgres in production and development, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = fileURLToPath(
	new URL("../../drizzle", import.meta.url),
);

export async function createDb(url: string): Promise<Db> {
	const db = drizzlePostgres(postgres(url), { schema });
	await migratePostgres(db, { migrationsFolder });
	return db;
}

/** A migrated, in-process Postgres: fresh in memory for tests, or kept in a folder for development. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
	// PGlite won't create missing parent folders itself.
	if (dataDir) mkdirSync(dataDir, { recursive: true });
	const db = drizzlePglite(new PGlite(dataDir), { schema });
	await migratePglite(db, { migrationsFolder });
	return db;
}
