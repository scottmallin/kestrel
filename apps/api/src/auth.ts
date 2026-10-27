import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { Db } from "./db/client.ts";
import * as schema from "./db/schema.ts";

export type AuthOptions = {
	db: Db;
	secret: string;
	/** Where the API is served from, e.g. http://localhost:3000. */
	baseURL: string;
	/** Origins (such as the editor's) allowed to call the auth endpoints with cookies. */
	trustedOrigins?: string[];
};

export function createAuth({
	db,
	secret,
	baseURL,
	trustedOrigins = [],
}: AuthOptions) {
	return betterAuth({
		database: drizzleAdapter(db, { provider: "pg", schema }),
		secret,
		baseURL,
		trustedOrigins,
		emailAndPassword: { enabled: true },
		plugins: [organization()],
	});
}

export type Auth = ReturnType<typeof createAuth>;
