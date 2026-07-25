import { eq } from "drizzle-orm";
import type { PermissionKey } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { permissions, rolePermissions } from "../db/schema.js";

export type PermissionRow = typeof permissions.$inferSelect;

/** Platform-owned reference data. */
export function createPermissionsRepo(db: Database) {
  return {
    async listAll(): Promise<PermissionRow[]> {
      return db.select().from(permissions);
    },

    async getPermissionKeysForRole(roleId: string): Promise<PermissionKey[]> {
      const rows = await db
        .select({ key: permissions.key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, roleId));
      return rows.map((row) => row.key as PermissionKey);
    },
  };
}

export type PermissionsRepo = ReturnType<typeof createPermissionsRepo>;
