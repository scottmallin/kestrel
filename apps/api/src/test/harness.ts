import { buildApp } from "../app.ts";
import { createAuth } from "../auth.ts";
import { createPgliteDb } from "../db/client.ts";
import { memoryStorage } from "../storage.ts";

/** A fresh app on an empty in-process Postgres, with helpers to act as signed-up users. */
export async function testApp() {
	const db = await createPgliteDb();
	const auth = createAuth({
		db,
		secret: "test-secret-at-least-32-characters-long",
		baseURL: "http://localhost",
	});
	const app = buildApp({ db, auth, storage: memoryStorage() });
	let users = 0;

	/** Signs up a new user who owns a new Organisation, returning a cookie for their requests. */
	async function signUp(organisationName = `Org ${users + 1}`) {
		users++;
		const signedUp = await app.inject({
			method: "POST",
			url: "/api/auth/sign-up/email",
			payload: {
				email: `user${users}@example.com`,
				password: "correct horse battery",
				name: `User ${users}`,
			},
		});
		if (signedUp.statusCode !== 200)
			throw new Error(`Sign-up failed: ${signedUp.body}`);
		const cookie = signedUp.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		const created = await app.inject({
			method: "POST",
			url: "/api/auth/organization/create",
			headers: { cookie },
			payload: {
				name: organisationName,
				slug: organisationName.toLowerCase().replace(/\W+/g, "-"),
			},
		});
		if (created.statusCode !== 200)
			throw new Error(`Creating Organisation failed: ${created.body}`);
		const organisation = created.json<{ id: string }>();
		return {
			organisationId: organisation.id,
			request: (
				method: "GET" | "POST" | "PUT",
				url: string,
				payload?: object,
			) =>
				app.inject({
					method,
					url,
					headers: { cookie },
					...(payload && { payload }),
				}),
			upload: (url: string, body: Buffer, contentType: string) =>
				app.inject({
					method: "PUT",
					url,
					headers: { cookie, "content-type": contentType },
					payload: body,
				}),
		};
	}

	return { app, db, signUp };
}
