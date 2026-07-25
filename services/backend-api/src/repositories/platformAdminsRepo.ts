import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { platformAdmins } from "../db/schema.js";

export type PlatformAdminRow = typeof platformAdmins.$inferSelect;

/** Platform-owned: who holds platform-level authority (currently only super_admin). See schema.ts for rationale. */
export function createPlatformAdminsRepo(db: Database) {
  return {
    async findByUserId(userId: string): Promise<PlatformAdminRow | null> {
      const [row] = await db.select().from(platformAdmins).where(eq(platformAdmins.userId, userId)).limit(1);
      return row ?? null;
    },
  };
}

export type PlatformAdminsRepo = ReturnType<typeof createPlatformAdminsRepo>;
