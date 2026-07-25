import { eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { roles } from "../db/schema.js";

export type RoleRow = typeof roles.$inferSelect;

/** Platform-owned: predefined system roles (tenant_id IS NULL), read-only in Increment 1. */
export function createRolesRepo(db: Database) {
  return {
    async listSystemRoles(): Promise<RoleRow[]> {
      return db.select().from(roles).where(isNull(roles.tenantId));
    },

    async findSystemRoleByKey(key: string): Promise<RoleRow | null> {
      const [row] = await db
        .select()
        .from(roles)
        .where(eq(roles.key, key))
        .limit(1);
      return row && row.tenantId === null ? row : null;
    },

    async findById(id: string): Promise<RoleRow | null> {
      const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
      return row ?? null;
    },
  };
}

export type RolesRepo = ReturnType<typeof createRolesRepo>;
