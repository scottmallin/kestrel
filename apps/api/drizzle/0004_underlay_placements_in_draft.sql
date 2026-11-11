-- Placements now live in the Draft (ADR 0008). Every stored scale was the default 20 px/m, which is
-- exactly where an Underlay without a Placement is shown, so no data needs moving.
ALTER TABLE "underlay" DROP COLUMN "pixels_per_metre";