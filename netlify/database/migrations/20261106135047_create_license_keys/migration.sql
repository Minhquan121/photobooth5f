CREATE TABLE "license_keys" (
	"id" serial PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"duration_hours" integer,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"device_id" text,
	"revoked" boolean DEFAULT false NOT NULL
);
