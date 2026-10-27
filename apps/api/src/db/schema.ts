import type { Draft, Operation } from "@kestrel/domain";
import {
	integer,
	jsonb,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
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

export const levels = pgTable("level", {
	id: uuid("id").primaryKey().defaultRandom(),
	mapId: uuid("map_id")
		.notNull()
		.references(() => maps.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	/** Order from the lowest Level up; 0 is the ground floor. */
	ordinal: integer("ordinal").notNull(),
	/** Storage key of the Underlay file, if one has been uploaded. */
	underlayKey: text("underlay_key"),
	underlayPixelsPerMetre: real("underlay_pixels_per_metre"),
});

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
