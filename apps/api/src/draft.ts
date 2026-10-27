import {
	applyOperation,
	type Draft,
	emptyDraft,
	type Operation,
} from "@kestrel/domain";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import type { Db } from "./db/client.ts";
import { draftOperations, draftSnapshots } from "./db/schema.ts";

/** The Draft after the latest Operation: the newest snapshot plus everything logged since (ADR 0005). */
export async function loadDraft(
	db: Db,
	mapId: string,
): Promise<{ seq: number; draft: Draft }> {
	const [snapshot] = await db
		.select()
		.from(draftSnapshots)
		.where(eq(draftSnapshots.mapId, mapId))
		.orderBy(desc(draftSnapshots.seq))
		.limit(1);
	let draft = snapshot?.draft ?? emptyDraft();
	let seq = snapshot?.seq ?? 0;
	const later = await db
		.select()
		.from(draftOperations)
		.where(and(eq(draftOperations.mapId, mapId), gt(draftOperations.seq, seq)))
		.orderBy(asc(draftOperations.seq));
	for (const row of later) {
		const result = applyOperation(draft, row.operation);
		if (!result.ok)
			throw new Error(
				`Logged Operation ${row.seq} on Map ${mapId} no longer applies: ${result.error}`,
			);
		draft = result.draft;
		seq = row.seq;
	}
	return { seq, draft };
}

export type AppendResult =
	| { readonly ok: true; readonly seq: number }
	/** Someone saved since baseSeq; the client must reload from `seq`. */
	| { readonly ok: false; readonly reason: "conflict"; readonly seq: number }
	| { readonly ok: false; readonly reason: "invalid"; readonly error: string };

/**
 * Appends Operations to the Map's log, but only if nothing has been saved since `baseSeq`.
 * Every Operation is replayed first, so an invalid one rejects the whole batch.
 */
export async function appendOperations(
	db: Db,
	mapId: string,
	authorId: string,
	baseSeq: number,
	operations: readonly Operation[],
): Promise<AppendResult> {
	try {
		return await db.transaction(async (tx) => {
			const current = await loadDraft(tx, mapId);
			if (current.seq !== baseSeq)
				return { ok: false, reason: "conflict", seq: current.seq } as const;
			let draft = current.draft;
			for (const [i, operation] of operations.entries()) {
				const result = applyOperation(draft, operation);
				if (!result.ok)
					return {
						ok: false,
						reason: "invalid",
						error: `Operation ${i + 1}: ${result.error}`,
					} as const;
				draft = result.draft;
			}
			if (operations.length > 0) {
				await tx.insert(draftOperations).values(
					operations.map((operation, i) => ({
						mapId,
						seq: baseSeq + i + 1,
						operation,
						authorId,
					})),
				);
			}
			return { ok: true, seq: baseSeq + operations.length } as const;
		});
	} catch (error) {
		// Two saves raced past the check above; the loser hits the (map, seq) primary key.
		if (isUniqueViolation(error))
			return {
				ok: false,
				reason: "conflict",
				seq: (await loadDraft(db, mapId)).seq,
			};
		throw error;
	}
}

function isUniqueViolation(error: unknown): boolean {
	for (
		let e: unknown = error;
		e instanceof Object;
		e = (e as { cause?: unknown }).cause
	) {
		if ((e as { code?: unknown }).code === "23505") return true;
	}
	return false;
}
