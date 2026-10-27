import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.ts";
import { latestBundleForEmbed, publishMap } from "../publish.ts";
import { findMapForUser, isUuid } from "./access.ts";
import { requireUser } from "./session.ts";

export const publishRoutes =
	({ db, auth, storage }: AppDeps) =>
	async (app: FastifyInstance) => {
		app.post<{ Params: { mapId: string } }>(
			"/api/maps/:mapId/publish",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				const map = await findMapForUser(db, request.params.mapId, user.userId);
				if (!map) return reply.status(404).send({ error: "No such Map." });
				return publishMap(db, storage, map, user.userId);
			},
		);

		// Public: this is what Embeds on customers' websites load. No cookies, any origin.
		app.get<{ Params: { embedId: string } }>(
			"/api/public/embeds/:embedId",
			async (request, reply) => {
				reply.header("access-control-allow-origin", "*");
				const bundle = isUuid(request.params.embedId)
					? await latestBundleForEmbed(db, storage, request.params.embedId)
					: null;
				if (!bundle)
					return reply.status(404).send({ error: "Nothing published here." });
				return (
					reply
						.header("content-type", bundle.contentType)
						// Short, because "latest" changes on every publish; a CDN can serve stale while it revalidates.
						.header(
							"cache-control",
							"public, max-age=60, stale-while-revalidate=600",
						)
						.send(bundle.bytes)
				);
			},
		);
	};
