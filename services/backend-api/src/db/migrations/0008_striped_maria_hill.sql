ALTER TABLE "stores" ADD COLUMN "whatsapp_number" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(30);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_unique" ON "users" USING btree ("phone");