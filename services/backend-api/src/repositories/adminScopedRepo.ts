import type { PermissionKey } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { createPermissionsRepo } from "./permissionsRepo.js";
import { createPlatformAdminsRepo } from "./platformAdminsRepo.js";

export interface AdminContext {
  userId: string;
  roleId: string;
  permissions: PermissionKey[];
}

/**
 * The explicit cross-tenant path (docs/milestone-0-implementation-spec.md
 * §9): resolves whether a user holds platform admin authority and which
 * permissions it grants. Returns null (not a permission) if the user isn't
 * a platform admin at all - callers (requireAdminPermission middleware)
 * turn that into a 403, never a silent bypass.
 */
export async function resolveAdminContext(db: Database, userId: string): Promise<AdminContext | null> {
  const platformAdminsRepo = createPlatformAdminsRepo(db);
  const admin = await platformAdminsRepo.findByUserId(userId);
  if (!admin) return null;

  const permissionsRepo = createPermissionsRepo(db);
  const permissions = await permissionsRepo.getPermissionKeysForRole(admin.roleId);
  return { userId, roleId: admin.roleId, permissions };
}
