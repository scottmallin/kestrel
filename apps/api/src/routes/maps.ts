import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.ts";
import { levels, maps } from "../db/schema.ts";
import { requireUser } from "./session.ts";

export const mapRoutes =
	({ db, auth }: AppDeps) =>
	async (app: FastifyInstance) => {
		app.get("/api/maps", async (request, reply) => {
			const user = await requireUser(auth, request, reply);
			if (!user) return;
			if (!user.organizationId) return [];
			return db
				.select({ id: maps.id, name: maps.name })
				.from(maps)
				.where(eq(maps.organizationId, user.organizationId))
				.orderBy(asc(maps.createdAt));
		});

		app.post<{ Body: { name?: unknown } }>(
			"/api/maps",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				if (!user.organizationId)
					return reply
						.status(400)
						.send({ error: "Choose an Organisation first." });
				const name =
					typeof request.body?.name === "string"
						? request.body.name.trim()
						: "";
				if (!name)
					return reply.status(400).send({ error: "Give the Map a name." });

				const organizationId = user.organizationId;
				const created = await db.transaction(async (tx) => {
					const [map] = await tx
						.insert(maps)
						.values({ organizationId, name })
						.returning();
					if (!map) throw new Error("Map insert returned nothing");
					const created = await tx
						.insert(levels)
						.values({ mapId: map.id, name: "Ground floor", ordinal: 0 })
						.returning({
							id: levels.id,
							name: levels.name,
							ordinal: levels.ordinal,
						});
					return { id: map.id, name: map.name, levels: created };
				});
				return reply.status(201).send(created);
			},
		);
	};
