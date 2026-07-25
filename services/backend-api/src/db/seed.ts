import { hash as argon2Hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { SYSTEM_ROLE_KEYS, PERMISSION_KEYS, type PermissionKey } from "@fashion-platform/shared-types";
import { SYSTEM_ROLE_PERMISSIONS } from "@fashion-platform/domain-shared";
import { createDatabase } from "./client.js";
import { permissions, platformAdmins, rolePermissions, roles, users } from "./schema.js";

const ROLE_NAMES: Record<string, string> = {
  [SYSTEM_ROLE_KEYS.SUPER_ADMIN]: "Super Admin",
  [SYSTEM_ROLE_KEYS.STORE_OWNER]: "Store Owner",
  [SYSTEM_ROLE_KEYS.STORE_MANAGER]: "Store Manager",
  [SYSTEM_ROLE_KEYS.CATALOG_MANAGER]: "Catalog Manager",
  [SYSTEM_ROLE_KEYS.ORDER_MANAGER]: "Order Manager",
  [SYSTEM_ROLE_KEYS.STAFF_BASIC]: "Staff (Basic)",
};

const PERMISSION_DEFINITIONS: Record<
  PermissionKey,
  { resource: string; action: string; description: string }
> = {
  [PERMISSION_KEYS.STORE_READ]: {
    resource: "store",
    action: "read",
    description: "Read store profile and branding",
  },
  [PERMISSION_KEYS.STORE_UPDATE]: {
    resource: "store",
    action: "update",
    description: "Update store profile and branding",
  },
  [PERMISSION_KEYS.STAFF_READ]: {
    resource: "staff",
    action: "read",
    description: "View tenant staff and their roles",
  },
  [PERMISSION_KEYS.STAFF_CREATE]: {
    resource: "staff",
    action: "create",
    description: "Invite new staff members",
  },
  [PERMISSION_KEYS.STAFF_UPDATE]: {
    resource: "staff",
    action: "update",
    description: "Change a staff member's role or status",
  },
  [PERMISSION_KEYS.STAFF_DELETE]: {
    resource: "staff",
    action: "delete",
    description: "Revoke a staff member's access",
  },
  [PERMISSION_KEYS.TENANT_READ]: {
    resource: "tenant",
    action: "read",
    description: "Read tenant details",
  },
  [PERMISSION_KEYS.TENANT_APPROVE]: {
    resource: "tenant",
    action: "approve",
    description: "Approve or reject a pending tenant",
  },
  [PERMISSION_KEYS.TENANT_SUSPEND]: {
    resource: "tenant",
    action: "suspend",
    description: "Suspend an active tenant",
  },
  [PERMISSION_KEYS.AUDIT_READ]: {
    resource: "audit",
    action: "read",
    description: "Read platform or tenant audit logs",
  },
  [PERMISSION_KEYS.CATALOG_READ]: {
    resource: "catalog",
    action: "read",
    description: "Read products, variants, categories, and collections",
  },
  [PERMISSION_KEYS.CATALOG_CREATE]: {
    resource: "catalog",
    action: "create",
    description: "Create products, variants, categories, and collections",
  },
  [PERMISSION_KEYS.CATALOG_UPDATE]: {
    resource: "catalog",
    action: "update",
    description: "Update products, variants, categories, and collections",
  },
  [PERMISSION_KEYS.CATALOG_DELETE]: {
    resource: "catalog",
    action: "delete",
    description: "Delete or archive products, variants, categories, and collections",
  },
  [PERMISSION_KEYS.INVENTORY_READ]: {
    resource: "inventory",
    action: "read",
    description: "Read variant stock levels",
  },
  [PERMISSION_KEYS.INVENTORY_UPDATE]: {
    resource: "inventory",
    action: "update",
    description: "Adjust variant stock levels",
  },
};

/** Idempotent: seeds system roles, permissions, role-permission grants, and one bootstrap Super Admin. */
export async function seed(
  connectionString: string,
  bootstrapAdmin?: { email: string; password: string },
): Promise<void> {
  const { db, pool } = createDatabase(connectionString);
  try {
    const roleIdByKey = new Map<string, string>();
    for (const [roleKey, name] of Object.entries(ROLE_NAMES)) {
      const [existing] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, roleKey))
        .limit(1);
      if (existing) {
        roleIdByKey.set(roleKey, existing.id);
        continue;
      }
      const [inserted] = await db
        .insert(roles)
        .values({ tenantId: null, key: roleKey, name, isSystem: true })
        .returning({ id: roles.id });
      if (inserted) roleIdByKey.set(roleKey, inserted.id);
    }

    const permissionIdByKey = new Map<string, string>();
    for (const [key, definition] of Object.entries(PERMISSION_DEFINITIONS)) {
      const [existing] = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.key, key))
        .limit(1);
      if (existing) {
        permissionIdByKey.set(key, existing.id);
        continue;
      }
      const [inserted] = await db
        .insert(permissions)
        .values({ key, ...definition })
        .returning({ id: permissions.id });
      if (inserted) permissionIdByKey.set(key, inserted.id);
    }

    for (const [roleKey, permissionKeys] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      const roleId = roleIdByKey.get(roleKey);
      if (!roleId) continue;
      for (const permissionKey of permissionKeys) {
        const permissionId = permissionIdByKey.get(permissionKey);
        if (!permissionId) continue;
        await db.insert(rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
      }
    }

    if (bootstrapAdmin) {
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, bootstrapAdmin.email))
        .limit(1);

      const superAdminRoleId = roleIdByKey.get(SYSTEM_ROLE_KEYS.SUPER_ADMIN);
      if (!superAdminRoleId) {
        throw new Error("super_admin role was not seeded");
      }

      let userId = existingUser?.id;
      if (!userId) {
        const [inserted] = await db
          .insert(users)
          .values({
            email: bootstrapAdmin.email,
            passwordHash: await argon2Hash(bootstrapAdmin.password),
            fullName: "Platform Super Admin",
            status: "active",
            emailVerifiedAt: new Date(),
          })
          .returning({ id: users.id });
        userId = inserted?.id;
      }

      if (userId) {
        await db
          .insert(platformAdmins)
          .values({ userId, roleId: superAdminRoleId })
          .onConflictDoNothing();
      }
    }
  } finally {
    await pool.end();
  }
}
