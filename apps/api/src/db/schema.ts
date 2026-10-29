import type { Draft, Operation } from "@kestrel/domain";
import { sql } from "drizzle-orm";
import {
	integer,
	jsonb,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema.ts";

export * from "./auth-schema.ts";

export const maps = pgTable("map", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** A Level's floor plan. Levels live in the Draft (ADR 0007); this row is editor-only and never published. */
export const underlays = pgTable(
	"underlay",
	{
		mapId: uuid("map_id")
			.notNull()
			.references(() => maps.id, { onDelete: "cascade" }),
		levelId: text("level_id").notNull(),
		storageKey: text("storage_key").notNull(),
		pixelsPerMetre: real("pixels_per_metre").notNull(),
	},
	(t) => [primaryKey({ columns: [t.mapId, t.levelId] })],
);

/** Every Operation applied to a Map's Draft, in order (ADR 0005). */
export const draftOperations = pgTable(
	"draft_operation",
	{
		mapId: uuid("map_id")
			.notNull()
			.references(() => maps.id, { onDelete: "cascade" }),
		/** 1 for the first Operation, rising by one each time. */
		seq: integer("seq").notNull(),
		operation: jsonb("operation").$type<Operation>().notNull(),
		authorId: text("author_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.mapId, t.seq] })],
);

/** The Draft as it stood after Operation `seq`, so loading needn't replay the whole log. */
export const draftSnapshots = pgTable(
	"draft_snapshot",
	{
		mapId: uuid("map_id")
			.notNull()
			.references(() => maps.id, { onDelete: "cascade" }),
		seq: integer("seq").notNull(),
		draft: jsonb("draft").$type<Draft>().notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.mapId, t.seq] })],
);

/** An unchangeable snapshot of a Map's Draft, compiled into a bundle for Embeds (ADR 0003). */
export const publishedVersions = pgTable(
	"published_version",
	{
		mapId: uuid("map_id")
			.notNull()
			.references(() => maps.id, { onDelete: "cascade" }),
		/** 1 for the first publish, rising by one each time. */
		version: integer("version").notNull(),
		/** The Draft's sequence number when it was published. */
		seq: integer("seq").notNull(),
		/** Storage key of the compiled bundle. */
		bundleKey: text("bundle_key").notNull(),
		publishedBy: text("published_by").references(() => user.id, {
			onDelete: "set null",
		}),
		publishedAt: timestamp("published_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.mapId, t.version] })],
);

/** A configured way of showing a Map on a website; its id is what embed codes point at. */
export const embeds = pgTable("embed", {
	id: uuid("id").primaryKey().defaultRandom(),
	mapId: uuid("map_id")
		.notNull()
		.references(() => maps.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** An Organisation's grouping of Listings, shared by all its Maps (ADR 0006). */
export const categories = pgTable(
	"category",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	// "Food" and "food" are the same Category.
	(t) => [
		uniqueIndex("category_organization_name").on(
			t.organizationId,
			sql`lower(${t.name})`,
		),
	],
);
