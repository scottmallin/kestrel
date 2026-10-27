import { type Operation, parseOperation } from "@kestrel/domain";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.ts";
import { appendOperations, loadDraft } from "../draft.ts";
import { findMapForUser } from "./access.ts";
import { requireUser } from "./session.ts";

/** Most Operations accepted in one save; the editor sends far fewer. */
const MAX_BATCH = 500;

export const draftRoutes =
	({ db, auth }: AppDeps) =>
	async (app: FastifyInstance) => {
		app.get<{ Params: { mapId: string } }>(
			"/api/maps/:mapId/draft",
			async (request, reply) => {
				const user = await requireUser(auth, request, reply);
				if (!user) return;
				const map = await findMapForUser(db, request.params.mapId, user.userId);
				if (!map) return reply.status(404).send({ error: "No such Map." });
				return loadDraft(db, map.id);
			},
		);

		app.post<{
			Params: { mapId: string };
			Body: { baseSeq?: unknown; operations?: unknown };
		}>("/api/maps/:mapId/operations", async (request, reply) => {
			const user = await requireUser(auth, request, reply);
			if (!user) return;
			const map = await findMapForUser(db, request.params.mapId, user.userId);
			if (!map) return reply.status(404).send({ error: "No such Map." });
			const { baseSeq, operations: raw } = request.body ?? {};
			if (!Number.isInteger(baseSeq) || (baseSeq as number) < 0) {
				return reply
					.status(400)
					.send({ error: "baseSeq must be a whole number." });
			}
			if (!Array.isArray(raw) || raw.length > MAX_BATCH) {
				return reply.status(400).send({
					error: `operations must be a list of at most ${MAX_BATCH}.`,
				});
			}
			const operations: Operation[] = [];
			for (const [i, item] of raw.entries()) {
				const parsed = parseOperation(item);
				if (!parsed.ok)
					return reply
						.status(400)
						.send({ error: `Operation ${i + 1}: ${parsed.error}` });
				operations.push(parsed.value);
			}
			const result = await appendOperations(
				db,
				map.id,
				user.userId,
				baseSeq as number,
				operations,
			);
			if (result.ok) return { seq: result.seq };
			if (result.reason === "conflict") {
				return reply.status(409).send({
					error: "This Map was changed elsewhere. Reload to continue.",
					seq: result.seq,
				});
			}
			return reply.status(422).send({ error: result.error });
		});
	};
