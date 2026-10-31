import { randomUUID } from "node:crypto";
import { type Draft, emptyDraft, type Level } from "@kestrel/domain";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.ts";
import { draftSnapshots, maps } from "../db/schema.ts";
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
					// The Draft starts with a ground floor, as a snapshot before the first Operation (ADR 0007).
					const ground: Level = {
						id: randomUUID(),
						name: "Ground floor",
						ordinal: 0,
					};
					const draft: Draft = {
						...emptyDraft(),
						levels: { [ground.id]: ground },
					};
					await tx
						.insert(draftSnapshots)
						.values({ mapId: map.id, seq: 0, draft });
					return { id: map.id, name: map.name, levels: [ground] };
				});
				return reply.status(201).send(created);
			},
		);
	};
