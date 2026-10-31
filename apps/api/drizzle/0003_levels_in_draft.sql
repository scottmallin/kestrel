-- Levels move into the Draft; Underlays move to their own table (ADR 0007).
CREATE TABLE "underlay" (
	"map_id" uuid NOT NULL,
	"level_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"pixels_per_metre" real NOT NULL,
	CONSTRAINT "underlay_map_id_level_id_pk" PRIMARY KEY("map_id","level_id")
);
--> statement-breakpoint
ALTER TABLE "underlay" ADD CONSTRAINT "underlay_map_id_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."map"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "underlay" ("map_id", "level_id", "storage_key", "pixels_per_metre")
SELECT "map_id", "id"::text, "underlay_key", coalesce("underlay_pixels_per_metre", 20)
FROM "level" WHERE "underlay_key" IS NOT NULL;
--> statement-breakpoint
-- Each Map's Levels, as the Draft's `levels`: { "<id>": { id, name, ordinal } }.
CREATE TEMPORARY TABLE "map_levels" AS
SELECT "map_id", jsonb_object_agg(
	"id"::text,
	jsonb_build_object('id', "id"::text, 'name', "name", 'ordinal', "ordinal")
) AS "levels"
FROM "level" GROUP BY "map_id";
--> statement-breakpoint
-- Snapshots already stored gain the Map's Levels, so loading from them still works.
UPDATE "draft_snapshot" AS s
SET "draft" = s."draft" || jsonb_build_object('levels', coalesce(ml."levels", '{}'::jsonb))
FROM "map" AS m LEFT JOIN "map_levels" AS ml ON ml."map_id" = m."id"
WHERE m."id" = s."map_id";
--> statement-breakpoint
-- A snapshot before the first Operation holds the Levels, so every logged Operation replays unchanged.
INSERT INTO "draft_snapshot" ("map_id", "seq", "draft")
SELECT m."id", 0, jsonb_build_object(
	'levels', coalesce(ml."levels", '{}'::jsonb),
	'spaces', '{}'::jsonb,
	'listings', '{}'::jsonb
)
FROM "map" AS m LEFT JOIN "map_levels" AS ml ON ml."map_id" = m."id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DROP TABLE "map_levels";
--> statement-breakpoint
DROP TABLE "level" CASCADE;
