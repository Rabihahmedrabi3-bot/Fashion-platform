import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS, SYSTEM_ROLE_KEYS } from "@fashion-platform/shared-types";
import {
  SYSTEM_ROLE_PERMISSIONS,
  canAssignRole,
  hasAnyPermission,
  hasPermission,
  resolvePermissionsForRole,
  type RolePermissionAssignment,
} from "../src/index.js";

describe("resolvePermissionsForRole", () => {
  const assignments: RolePermissionAssignment[] = [
    { roleKey: SYSTEM_ROLE_KEYS.STORE_OWNER, permissionKeys: SYSTEM_ROLE_PERMISSIONS.store_owner },
    { roleKey: SYSTEM_ROLE_KEYS.STAFF_BASIC, permissionKeys: SYSTEM_ROLE_PERMISSIONS.staff_basic },
  ];

  it("returns the permission set for a known role", () => {
    const permissions = resolvePermissionsForRole(SYSTEM_ROLE_KEYS.STORE_OWNER, assignments);
    expect(permissions).toContain(PERMISSION_KEYS.STAFF_CREATE);
    expect(permissions).toContain(PERMISSION_KEYS.STORE_UPDATE);
  });

  it("returns an empty array for an unknown role", () => {
    expect(resolvePermissionsForRole("nonexistent_role", assignments)).toEqual([]);
  });

  it("staff_basic never gets staff management permissions", () => {
    const permissions = resolvePermissionsForRole(SYSTEM_ROLE_KEYS.STAFF_BASIC, assignments);
    expect(permissions).not.toContain(PERMISSION_KEYS.STAFF_CREATE);
    expect(permissions).not.toContain(PERMISSION_KEYS.STAFF_DELETE);
  });
});

describe("hasPermission / hasAnyPermission", () => {
  it("hasPermission checks exact membership", () => {
    expect(hasPermission([PERMISSION_KEYS.STORE_READ], PERMISSION_KEYS.STORE_READ)).toBe(true);
    expect(hasPermission([PERMISSION_KEYS.STORE_READ], PERMISSION_KEYS.STORE_UPDATE)).toBe(false);
  });

  it("hasAnyPermission is satisfied by at least one match", () => {
    expect(
      hasAnyPermission([PERMISSION_KEYS.STORE_READ], [
        PERMISSION_KEYS.STORE_UPDATE,
        PERMISSION_KEYS.STORE_READ,
      ]),
    ).toBe(true);
    expect(hasAnyPermission([PERMISSION_KEYS.STORE_READ], [PERMISSION_KEYS.TENANT_APPROVE])).toBe(
      false,
    );
  });
});

describe("canAssignRole", () => {
  it("only a Store Owner can assign the Store Owner role", () => {
    expect(canAssignRole(SYSTEM_ROLE_KEYS.STORE_OWNER, SYSTEM_ROLE_KEYS.STORE_OWNER)).toBe(true);
    expect(canAssignRole(SYSTEM_ROLE_KEYS.STORE_MANAGER, SYSTEM_ROLE_KEYS.STORE_OWNER)).toBe(false);
  });

  it("Store Manager can assign non-Owner roles", () => {
    expect(canAssignRole(SYSTEM_ROLE_KEYS.STORE_MANAGER, SYSTEM_ROLE_KEYS.STAFF_BASIC)).toBe(true);
  });

  it("Staff (Basic) cannot assign any role", () => {
    expect(canAssignRole(SYSTEM_ROLE_KEYS.STAFF_BASIC, SYSTEM_ROLE_KEYS.STAFF_BASIC)).toBe(false);
  });
});
