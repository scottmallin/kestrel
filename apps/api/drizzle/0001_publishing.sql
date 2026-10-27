CREATE TABLE "embed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_version" (
	"map_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"seq" integer NOT NULL,
	"bundle_key" text NOT NULL,
	"published_by" text,
	"published_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "published_version_map_id_version_pk" PRIMARY KEY("map_id","version")
);
--> statement-breakpoint
ALTER TABLE "embed" ADD CONSTRAINT "embed_map_id_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_version" ADD CONSTRAINT "published_version_map_id_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_version" ADD CONSTRAINT "published_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;