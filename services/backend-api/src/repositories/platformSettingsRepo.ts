import type { Database } from "../db/client.js";
import { platformSettings } from "../db/schema.js";

export type PlatformSettingsRow = typeof platformSettings.$inferSelect;

/**
 * Platform-owned singleton (see schema.ts) - not tenant-scoped, no
 * scope/factory param needed. Reads/writes operate on whichever single row
 * exists rather than filtering by a known id.
 */
export function createPlatformSettingsRepo(db: Database) {
  return {
    async get(): Promise<PlatformSettingsRow> {
      const [row] = await db.select().from(platformSettings).limit(1);
      if (!row) throw new Error("platform_settings singleton row is missing - run npm run db:seed");
      return row;
    },

    async update(input: { tenantRegistrationOpen: boolean }): Promise<PlatformSettingsRow> {
      const [row] = await db
        .update(platformSettings)
        .set({ tenantRegistrationOpen: input.tenantRegistrationOpen, updatedAt: new Date() })
        .returning();
      if (!row) throw new Error("platform_settings singleton row is missing - run npm run db:seed");
      return row;
    },
  };
}

export type PlatformSettingsRepo = ReturnType<typeof createPlatformSettingsRepo>;
