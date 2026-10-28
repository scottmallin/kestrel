import { compileBundle } from "@kestrel/publish";
import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "./db/client.ts";
import { categories, embeds, levels, publishedVersions } from "./db/schema.ts";
import { loadDraft } from "./draft.ts";
import type { Storage } from "./storage.ts";

type MapRef = { id: string; name: string; organizationId: string };

/**
 * Compiles the Map's saved Draft into a new Published Version, stores the bundle, and makes sure the
 * Map has an Embed to show it through. Returns the version number and that Embed's id.
 */
export async function publishMap(
	db: Db,
	storage: Storage,
	/** Where the API is publicly reachable; logo URLs in the bundle start here. */
	publicUrl: string,
	map: MapRef,
	userId: string,
) {
	const [{ seq, draft }, levelRows, categoryRows, [latest]] = await Promise.all(
		[
			loadDraft(db, map.id),
			db
				.select()
				.from(levels)
				.where(eq(levels.mapId, map.id))
				.orderBy(asc(levels.ordinal)),
			db
				.select({ id: categories.id, name: categories.name })
				.from(categories)
				.where(eq(categories.organizationId, map.organizationId)),
			db
				.select({ version: publishedVersions.version })
				.from(publishedVersions)
				.where(eq(publishedVersions.mapId, map.id))
				.orderBy(desc(publishedVersions.version))
				.limit(1),
		],
	);
	const version = (latest?.version ?? 0) + 1;
	const bundle = compileBundle({
		map: { id: map.id, name: map.name },
		levels: levelRows.map((l) => ({
			id: l.id,
			name: l.name,
			ordinal: l.ordinal,
		})),
		categories: categoryRows,
		logoUrl: (key) => `${publicUrl}/api/public/${key}`,
		draft,
		version,
		publishedAt: new Date().toISOString(),
	});
	const bundleKey = `organisations/${map.organizationId}/maps/${map.id}/published/v${version}.json`;
	await storage.put(bundleKey, {
		bytes: Buffer.from(JSON.stringify(bundle)),
		contentType: "application/json",
	});

	return db.transaction(async (tx) => {
		await tx
			.insert(publishedVersions)
			.values({ mapId: map.id, version, seq, bundleKey, publishedBy: userId });
		const [existing] = await tx
			.select({ id: embeds.id })
			.from(embeds)
			.where(eq(embeds.mapId, map.id))
			.orderBy(asc(embeds.createdAt))
			.limit(1);
		const embed =
			existing ??
			(
				await tx
					.insert(embeds)
					.values({ mapId: map.id, name: "Website" })
					.returning({ id: embeds.id })
			)[0];
		if (!embed) throw new Error("Embed insert returned nothing");
		return { version, embedId: embed.id };
	});
}

/** The bundle of the latest Published Version shown by an Embed, or null if there's nothing to show. */
export async function latestBundleForEmbed(
	db: Db,
	storage: Storage,
	embedId: string,
) {
	const [row] = await db
		.select({ bundleKey: publishedVersions.bundleKey })
		.from(embeds)
		.innerJoin(publishedVersions, eq(publishedVersions.mapId, embeds.mapId))
		.where(eq(embeds.id, embedId))
		.orderBy(desc(publishedVersions.version))
		.limit(1);
	return row ? storage.get(row.bundleKey) : null;
}
