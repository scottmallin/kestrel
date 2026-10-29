import { randomUUID } from "node:crypto";
import { LEVEL_ID } from "@kestrel/domain";
import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.ts";
import { embeds, publishedVersions, underlays } from "../db/schema.ts";
import { loadDraft } from "../draft.ts";
import { isImageUpload } from "../images.ts";
import { DEFAULT_PIXELS_PER_METRE } from "../underlay.ts";
import { findMapForUser } from "./access.ts";
import { requireUser } from "./session.ts";

type LevelParams = { Params: { mapId: string; levelId: string } };

export const levelRoutes =
	({ db, auth, storage }: AppDeps) =>
	async (app: FastifyInstance) => {
		app.get<{ Params: { mapId: string } }>(
			"/api/maps/:mapId",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				const map = await findMapForUser(db, request.params.mapId, user.userId);
				if (!map) return reply.status(404).send({ error: "No such Map." });
				const [underlayRows, embedRows, [latest]] = await Promise.all([
					db.select().from(underlays).where(eq(underlays.mapId, map.id)),
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
					// The Levels themselves are in the Draft (ADR 0007).
					underlays: Object.fromEntries(
						underlayRows.map((u) => [
							u.levelId,
							{ pixelsPerMetre: u.pixelsPerMetre },
						]),
					),
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

		app.put<LevelParams>(
			"/api/maps/:mapId/levels/:levelId/underlay",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				const { levelId } = request.params;
				const map = await findMapForUser(db, request.params.mapId, user.userId);
				if (!map || !LEVEL_ID.test(levelId))
					return reply.status(404).send({ error: "No such Level." });
				const { draft } = await loadDraft(db, map.id);
				if (!draft.levels[levelId])
					return reply.status(404).send({ error: "No such Level." });
				const contentType = request.headers["content-type"] ?? "";
				if (!isImageUpload(contentType, request.body)) {
					return reply.status(415).send({
						error: "Upload the floor plan as a PNG, JPEG or WebP image.",
					});
				}
				const storageKey = `organisations/${map.organizationId}/maps/${map.id}/levels/${levelId}/underlay-${randomUUID()}`;
				await storage.put(storageKey, { bytes: request.body, contentType });
				const values = {
					storageKey,
					pixelsPerMetre: DEFAULT_PIXELS_PER_METRE,
				};
				await db
					.insert(underlays)
					.values({ mapId: map.id, levelId, ...values })
					.onConflictDoUpdate({
						target: [underlays.mapId, underlays.levelId],
						set: values,
					});
				return reply.status(204).send();
			},
		);

		app.get<LevelParams>(
			"/api/maps/:mapId/levels/:levelId/underlay",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				const map = await findMapForUser(db, request.params.mapId, user.userId);
				const [row] = map
					? await db
							.select()
							.from(underlays)
							.where(
								and(
									eq(underlays.mapId, map.id),
									eq(underlays.levelId, request.params.levelId),
								),
							)
					: [];
				const file = row ? await storage.get(row.storageKey) : null;
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
