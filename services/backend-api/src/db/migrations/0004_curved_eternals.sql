CREATE TABLE IF NOT EXISTS "platform_settings" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"tenant_registration_open" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
