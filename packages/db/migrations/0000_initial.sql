CREATE SCHEMA "game";
--> statement-breakpoint
CREATE TABLE "game"."building_cells" (
	"planet_id" uuid NOT NULL,
	"x" smallint NOT NULL,
	"y" smallint NOT NULL,
	"building_id" uuid NOT NULL,
	CONSTRAINT "building_cells_planet_id_x_y_pk" PRIMARY KEY("planet_id","x","y")
);
--> statement-breakpoint
ALTER TABLE "game"."building_cells" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game"."buildings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"planet_id" uuid NOT NULL,
	"type_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"orientation" smallint NOT NULL,
	"anchor_x" smallint NOT NULL,
	"anchor_y" smallint NOT NULL,
	"level" integer NOT NULL,
	CONSTRAINT "buildings_orientation_range" CHECK ("game"."buildings"."orientation" between 0 and 3),
	CONSTRAINT "buildings_anchor_non_negative" CHECK ("game"."buildings"."anchor_x" >= 0 and "game"."buildings"."anchor_y" >= 0),
	CONSTRAINT "buildings_level_positive" CHECK ("game"."buildings"."level" >= 1)
);
--> statement-breakpoint
ALTER TABLE "game"."buildings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game"."cleared_cells" (
	"planet_id" uuid NOT NULL,
	"x" smallint NOT NULL,
	"y" smallint NOT NULL,
	"cleared_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cleared_cells_planet_id_x_y_pk" PRIMARY KEY("planet_id","x","y")
);
--> statement-breakpoint
ALTER TABLE "game"."cleared_cells" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game"."command_receipts" (
	"player_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "command_receipts_player_id_idempotency_key_pk" PRIMARY KEY("player_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "game"."command_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game"."planet_resources" (
	"planet_id" uuid NOT NULL,
	"resource_id" text NOT NULL,
	"amount_grains" bigint NOT NULL,
	"lost_grains" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "planet_resources_planet_id_resource_id_pk" PRIMARY KEY("planet_id","resource_id"),
	CONSTRAINT "planet_resources_amount_non_negative" CHECK ("game"."planet_resources"."amount_grains" >= 0),
	CONSTRAINT "planet_resources_lost_non_negative" CHECK ("game"."planet_resources"."lost_grains" >= 0)
);
--> statement-breakpoint
ALTER TABLE "game"."planet_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game"."planets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"occupant_id" uuid NOT NULL,
	"archetype_id" text NOT NULL,
	"layout_id" text NOT NULL,
	"consolidated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "planets_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
ALTER TABLE "game"."planets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game"."works" (
	"id" uuid PRIMARY KEY NOT NULL,
	"planet_id" uuid NOT NULL,
	"nature" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"target_building_id" uuid,
	"target_x" smallint,
	"target_y" smallint,
	"type_id" text,
	"variant_id" text,
	"orientation" smallint,
	CONSTRAINT "works_nature_vocabulary" CHECK ("game"."works"."nature" in ('build', 'upgrade', 'demolish', 'clear')),
	CONSTRAINT "works_due_after_start" CHECK ("game"."works"."due_at" > "game"."works"."started_at"),
	CONSTRAINT "works_orientation_range" CHECK ("game"."works"."orientation" is null or "game"."works"."orientation" between 0 and 3),
	CONSTRAINT "works_target_matches_nature" CHECK ((
          ("game"."works"."nature" = 'build' and "game"."works"."type_id" is not null and "game"."works"."variant_id" is not null
             and "game"."works"."orientation" is not null and "game"."works"."target_x" is not null
             and "game"."works"."target_y" is not null and "game"."works"."target_building_id" is null)
          or ("game"."works"."nature" in ('upgrade', 'demolish') and "game"."works"."target_building_id" is not null
             and "game"."works"."target_x" is null and "game"."works"."target_y" is null and "game"."works"."type_id" is null
             and "game"."works"."variant_id" is null and "game"."works"."orientation" is null)
          or ("game"."works"."nature" = 'clear' and "game"."works"."target_x" is not null and "game"."works"."target_y" is not null
             and "game"."works"."target_building_id" is null and "game"."works"."type_id" is null
             and "game"."works"."variant_id" is null and "game"."works"."orientation" is null)
        ))
);
--> statement-breakpoint
ALTER TABLE "game"."works" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game"."building_cells" ADD CONSTRAINT "building_cells_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "game"."planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."building_cells" ADD CONSTRAINT "building_cells_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "game"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."buildings" ADD CONSTRAINT "buildings_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "game"."planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."cleared_cells" ADD CONSTRAINT "cleared_cells_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "game"."planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."planet_resources" ADD CONSTRAINT "planet_resources_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "game"."planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."works" ADD CONSTRAINT "works_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "game"."planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."works" ADD CONSTRAINT "works_target_building_id_buildings_id_fk" FOREIGN KEY ("target_building_id") REFERENCES "game"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "building_cells_building_idx" ON "game"."building_cells" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "buildings_planet_idx" ON "game"."buildings" USING btree ("planet_id");--> statement-breakpoint
CREATE INDEX "planets_occupant_idx" ON "game"."planets" USING btree ("occupant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "works_one_unresolved_per_planet" ON "game"."works" USING btree ("planet_id") WHERE "game"."works"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "works_planet_idx" ON "game"."works" USING btree ("planet_id");