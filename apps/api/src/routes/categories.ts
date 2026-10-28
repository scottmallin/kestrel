import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppDeps } from "../app.ts";
import { categories } from "../db/schema.ts";
import { EXTENSIONS, isImageUpload } from "../images.ts";
import { findMapForUser, isUuid } from "./access.ts";
import { requireUser, type SignedIn } from "./session.ts";

const MAX_NAME = 60;

/** Only logo keys this route created; storage also holds private floor plans, which must never be served here. */
const LOGO_KEY = /^logos\/[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

function nameFrom(
	body: { name?: unknown } | undefined,
	reply: FastifyReply,
): string | null {
	const name = typeof body?.name === "string" ? body.name.trim() : "";
	if (!name || name.length > MAX_NAME) {
		void reply.status(400).send({
			error: `Give the Category a name of up to ${MAX_NAME} characters.`,
		});
		return null;
	}
	return name;
}

const isDuplicate = (error: unknown) => {
	for (
		let e: unknown = error;
		e instanceof Object;
		e = (e as { cause?: unknown }).cause
	) {
		if ((e as { code?: unknown }).code === "23505") return true;
	}
	return false;
};

/** Categories belong to the active Organisation (ADR 0006); logos are uploaded per Map and served publicly. */
export const categoryRoutes =
	({ db, auth, storage }: AppDeps) =>
	async (app: FastifyInstance) => {
		const inOrganisation = (user: SignedIn, id: string) =>
			and(
				eq(categories.id, id),
				eq(categories.organizationId, user.organizationId ?? ""),
			);

		app.get("/api/categories", async (request, reply) => {
			const user = await requireUser(auth, request, reply);
			if (!user) return;
			if (!user.organizationId) return [];
			return db
				.select({ id: categories.id, name: categories.name })
				.from(categories)
				.where(eq(categories.organizationId, user.organizationId))
				.orderBy(asc(categories.name));
		});

		app.post<{ Body: { name?: unknown } }>(
			"/api/categories",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				if (!user.organizationId)
					return reply
						.status(400)
						.send({ error: "Choose an Organisation first." });
				const name = nameFrom(request.body, reply);
				if (!name) return;
				try {
					const [created] = await db
						.insert(categories)
						.values({ organizationId: user.organizationId, name })
						.returning({ id: categories.id, name: categories.name });
					return reply.status(201).send(created);
				} catch (error) {
					if (isDuplicate(error))
						return reply
							.status(409)
							.send({ error: `There's already a Category called ${name}.` });
					throw error;
				}
			},
		);

		app.patch<{ Params: { id: string }; Body: { name?: unknown } }>(
			"/api/categories/:id",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				if (!isUuid(request.params.id))
					return reply.status(404).send({ error: "No such Category." });
				const name = nameFrom(request.body, reply);
				if (!name) return;
				try {
					const [updated] = await db
						.update(categories)
						.set({ name })
						.where(inOrganisation(user, request.params.id))
						.returning({ id: categories.id, name: categories.name });
					return (
						updated ?? reply.status(404).send({ error: "No such Category." })
					);
				} catch (error) {
					if (isDuplicate(error))
						return reply
							.status(409)
							.send({ error: `There's already a Category called ${name}.` });
					throw error;
				}
			},
		);

		app.delete<{ Params: { id: string } }>(
			"/api/categories/:id",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				if (!isUuid(request.params.id))
					return reply.status(404).send({ error: "No such Category." });
				// Listings still pointing here count as uncategorised from the next publish (ADR 0006).
				const deleted = await db
					.delete(categories)
					.where(inOrganisation(user, request.params.id))
					.returning({ id: categories.id });
				return deleted.length > 0
					? reply.status(204).send()
					: reply.status(404).send({ error: "No such Category." });
			},
		);

		app.put<{ Params: { mapId: string } }>(
			"/api/maps/:mapId/logos",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				const map = await findMapForUser(db, request.params.mapId, user.userId);
				if (!map) return reply.status(404).send({ error: "No such Map." });
				const contentType = request.headers["content-type"];
				if (!isImageUpload(contentType, request.body) || !contentType) {
					return reply
						.status(415)
						.send({ error: "Upload the logo as a PNG, JPEG or WebP image." });
				}
				const logoKey = `logos/${map.organizationId}/${randomUUID()}.${EXTENSIONS[contentType]}`;
				await storage.put(logoKey, { bytes: request.body, contentType });
				return reply.status(201).send({ logoKey });
			},
		);

		// Public: Embeds on customers' websites show these.
		app.get<{ Params: { "*": string } }>(
			"/api/public/logos/*",
			async (request, reply) => {
				const key = `logos/${request.params["*"]}`;
				const file = LOGO_KEY.test(key) ? await storage.get(key) : null;
				if (!file) return reply.status(404).send({ error: "No such logo." });
				return (
					reply
						.header("content-type", file.contentType)
						.header("access-control-allow-origin", "*")
						.header("x-content-type-options", "nosniff")
						.header("content-security-policy", "default-src 'none'; sandbox")
						// Keys are never reused, so a logo can be cached forever.
						.header("cache-control", "public, max-age=31536000, immutable")
						.send(file.bytes)
				);
			},
		);
	};
