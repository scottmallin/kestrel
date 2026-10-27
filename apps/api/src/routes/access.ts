import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { levels, maps, member } from "../db/schema.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids are UUIDs; checking first avoids a database error for anything else. */
export const isUuid = (value: string) => UUID.test(value);

/** The Map, if it exists and the user belongs to its Organisation; otherwise null (reply 404 either way). */
export async function findMapForUser(db: Db, mapId: string, userId: string) {
	if (!UUID.test(mapId)) return null;
	const [row] = await db
		.select({
			id: maps.id,
			name: maps.name,
			organizationId: maps.organizationId,
		})
		.from(maps)
		.innerJoin(
			member,
			and(
				eq(member.organizationId, maps.organizationId),
				eq(member.userId, userId),
			),
		)
		.where(eq(maps.id, mapId));
	return row ?? null;
}

/** The Level and its Map, if the user belongs to the Map's Organisation; otherwise null. */
export async function findLevelForUser(
	db: Db,
	levelId: string,
	userId: string,
) {
	if (!UUID.test(levelId)) return null;
	const [row] = await db
		.select({ level: levels, organizationId: maps.organizationId })
		.from(levels)
		.innerJoin(maps, eq(maps.id, levels.mapId))
		.innerJoin(
			member,
			and(
				eq(member.organizationId, maps.organizationId),
				eq(member.userId, userId),
			),
		)
		.where(eq(levels.id, levelId));
	return row ?? null;
}
