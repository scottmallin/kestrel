import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export function createDb(url: string) {
	return drizzle(postgres(url), { schema });
}

export type Db = ReturnType<typeof createDb>;
