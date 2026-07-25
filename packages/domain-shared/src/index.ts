// @fashion-platform/domain-shared
// Pure, DB-independent domain logic: role -> permission resolution and the
// static system-role authorization matrix. No I/O, unit-testable in isolation.

import {
  PERMISSION_KEYS,
  SYSTEM_ROLE_KEYS,
  type PermissionKey,
  type SystemRoleKey,
} from "@fashion-platform/shared-types";

/**
 * The Increment 1-2 slice of the platform authorization matrix
 * (docs/architecture-blueprint.md §... / docs/milestone-0-implementation-spec.md
 * §5): store settings, staff & roles, tenant approval, audit logs (Inc. 1),
 * plus products/variants/categories/collections and inventory (Inc. 2). This
 * is the single source of truth the seed script writes into
 * `role_permissions`, and what tests assert against.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleKey, PermissionKey[]> = {
  [SYSTEM_ROLE_KEYS.SUPER_ADMIN]: [
    PERMISSION_KEYS.STORE_READ,
    PERMISSION_KEYS.STAFF_READ,
    PERMISSION_KEYS.TENANT_READ,
    PERMISSION_KEYS.TENANT_APPROVE,
    PERMISSION_KEYS.TENANT_SUSPEND,
    PERMISSION_KEYS.AUDIT_READ,
    PERMISSION_KEYS.CATALOG_READ,
    PERMISSION_KEYS.INVENTORY_READ,
  ],
  [SYSTEM_ROLE_KEYS.STORE_OWNER]: [
    PERMISSION_KEYS.STORE_READ,
    PERMISSION_KEYS.STORE_UPDATE,
    PERMISSION_KEYS.STAFF_READ,
    PERMISSION_KEYS.STAFF_CREATE,
    PERMISSION_KEYS.STAFF_UPDATE,
    PERMISSION_KEYS.STAFF_DELETE,
    PERMISSION_KEYS.TENANT_READ,
    PERMISSION_KEYS.AUDIT_READ,
    PERMISSION_KEYS.CATALOG_READ,
    PERMISSION_KEYS.CATALOG_CREATE,
    PERMISSION_KEYS.CATALOG_UPDATE,
    PERMISSION_KEYS.CATALOG_DELETE,
    PERMISSION_KEYS.INVENTORY_READ,
    PERMISSION_KEYS.INVENTORY_UPDATE,
  ],
  [SYSTEM_ROLE_KEYS.STORE_MANAGER]: [
    PERMISSION_KEYS.STORE_READ,
    PERMISSION_KEYS.STORE_UPDATE,
    PERMISSION_KEYS.STAFF_READ,
    PERMISSION_KEYS.STAFF_UPDATE,
    PERMISSION_KEYS.TENANT_READ,
    PERMISSION_KEYS.CATALOG_READ,
    PERMISSION_KEYS.CATALOG_CREATE,
    PERMISSION_KEYS.CATALOG_UPDATE,
    PERMISSION_KEYS.CATALOG_DELETE,
    PERMISSION_KEYS.INVENTORY_READ,
    PERMISSION_KEYS.INVENTORY_UPDATE,
  ],
  [SYSTEM_ROLE_KEYS.CATALOG_MANAGER]: [
    PERMISSION_KEYS.STORE_READ,
    PERMISSION_KEYS.TENANT_READ,
    PERMISSION_KEYS.CATALOG_READ,
    PERMISSION_KEYS.CATALOG_CREATE,
    PERMISSION_KEYS.CATALOG_UPDATE,
    PERMISSION_KEYS.CATALOG_DELETE,
    PERMISSION_KEYS.INVENTORY_READ,
    PERMISSION_KEYS.INVENTORY_UPDATE,
  ],
  [SYSTEM_ROLE_KEYS.ORDER_MANAGER]: [
    PERMISSION_KEYS.STORE_READ,
    PERMISSION_KEYS.TENANT_READ,
    PERMISSION_KEYS.CATALOG_READ,
    PERMISSION_KEYS.INVENTORY_READ,
    PERMISSION_KEYS.INVENTORY_UPDATE,
  ],
  [SYSTEM_ROLE_KEYS.STAFF_BASIC]: [
    PERMISSION_KEYS.STORE_READ,
    PERMISSION_KEYS.TENANT_READ,
    PERMISSION_KEYS.CATALOG_READ,
    PERMISSION_KEYS.INVENTORY_READ,
  ],
};

/**
 * Store Manager may update staff but never elevate anyone to Store Owner
 * (docs/milestone-0-implementation-spec.md §5 and §8, PATCH memberships note).
 * This isn't expressible as a single permission flag, so it's a named rule
 * routes/tests check explicitly.
 */
export function canAssignRole(actingRoleKey: SystemRoleKey, targetRoleKey: SystemRoleKey): boolean {
  if (targetRoleKey === SYSTEM_ROLE_KEYS.STORE_OWNER) {
    return actingRoleKey === SYSTEM_ROLE_KEYS.STORE_OWNER;
  }
  return (
    actingRoleKey === SYSTEM_ROLE_KEYS.STORE_OWNER || actingRoleKey === SYSTEM_ROLE_KEYS.STORE_MANAGER
  );
}

export interface RolePermissionAssignment {
  roleKey: SystemRoleKey;
  permissionKeys: PermissionKey[];
}

/** Resolve the permission set for a role from an arbitrary assignment list (e.g. loaded from DB). */
export function resolvePermissionsForRole(
  roleKey: string,
  assignments: RolePermissionAssignment[],
): PermissionKey[] {
  const match = assignments.find((assignment) => assignment.roleKey === roleKey);
  return match ? [...match.permissionKeys] : [];
}

export function hasPermission(permissions: PermissionKey[], required: PermissionKey): boolean {
  return permissions.includes(required);
}

export function hasAnyPermission(permissions: PermissionKey[], required: PermissionKey[]): boolean {
  return required.some((key) => permissions.includes(key));
}
