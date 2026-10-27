import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.ts";
import { embeds, levels, publishedVersions } from "../db/schema.ts";
import { DEFAULT_PIXELS_PER_METRE } from "../underlay.ts";
import { findLevelForUser, findMapForUser } from "./access.ts";
import { requireUser } from "./session.ts";

/** Raster formats only: an uploaded SVG could run script on the API's origin. */
const UNDERLAY_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UNDERLAY_BYTES = 20 * 1024 * 1024;

export const levelRoutes =
	({ db, auth, storage }: AppDeps) =>
	async (app: FastifyInstance) => {
		app.addContentTypeParser(
			UNDERLAY_TYPES,
			{ parseAs: "buffer", bodyLimit: MAX_UNDERLAY_BYTES },
			(_req, body, done) => done(null, body),
		);

		app.get<{ Params: { mapId: string } }>(
			"/api/maps/:mapId",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				const map = await findMapForUser(db, request.params.mapId, user.userId);
				if (!map) return reply.status(404).send({ error: "No such Map." });
				const [rows, embedRows, [latest]] = await Promise.all([
					db
						.select()
						.from(levels)
						.where(eq(levels.mapId, map.id))
						.orderBy(asc(levels.ordinal)),
					db
						.select({ id: embeds.id, name: embeds.name })
						.from(embeds)
						.where(eq(embeds.mapId, map.id))
						.orderBy(asc(embeds.createdAt)),
					db
						.select({
							version: publishedVersions.version,
							publishedAt: publishedVersions.publishedAt,
						})
						.from(publishedVersions)
						.where(eq(publishedVersions.mapId, map.id))
						.orderBy(desc(publishedVersions.version))
						.limit(1),
				]);
				return {
					id: map.id,
					name: map.name,
					levels: rows.map((l) => ({
						id: l.id,
						name: l.name,
						ordinal: l.ordinal,
						underlay: l.underlayKey
							? {
									pixelsPerMetre:
										l.underlayPixelsPerMetre ?? DEFAULT_PIXELS_PER_METRE,
								}
							: null,
					})),
					published: latest
						? {
								version: latest.version,
								publishedAt: latest.publishedAt.toISOString(),
							}
						: null,
					embeds: embedRows,
				};
			},
		);

		app.put<{ Params: { levelId: string } }>(
			"/api/levels/:levelId/underlay",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				const found = await findLevelForUser(
					db,
					request.params.levelId,
					user.userId,
				);
				if (!found) return reply.status(404).send({ error: "No such Level." });
				const contentType = request.headers["content-type"] ?? "";
				if (
					!UNDERLAY_TYPES.includes(contentType) ||
					!Buffer.isBuffer(request.body)
				) {
					return reply.status(415).send({
						error: "Upload the floor plan as a PNG, JPEG or WebP image.",
					});
				}
				const key = `organisations/${found.organizationId}/levels/${found.level.id}/underlay-${randomUUID()}`;
				await storage.put(key, { bytes: request.body, contentType });
				await db
					.update(levels)
					.set({
						underlayKey: key,
						underlayPixelsPerMetre: DEFAULT_PIXELS_PER_METRE,
					})
					.where(eq(levels.id, found.level.id));
				return reply.status(204).send();
			},
		);

		app.get<{ Params: { levelId: string } }>(
			"/api/levels/:levelId/underlay",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				const found = await findLevelForUser(
					db,
					request.params.levelId,
					user.userId,
				);
				const file = found?.level.underlayKey
					? await storage.get(found.level.underlayKey)
					: null;
				if (!file)
					return reply
						.status(404)
						.send({ error: "No floor plan for this Level." });
				return reply
					.header("content-type", file.contentType)
					.header("x-content-type-options", "nosniff")
					.header("content-security-policy", "default-src 'none'; sandbox")
					.header("cache-control", "private, max-age=31536000, immutable")
					.send(file.bytes);
			},
		);
	};
