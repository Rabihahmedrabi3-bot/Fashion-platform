import { and, eq } from "drizzle-orm";
import type { TenantStatus } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { stores, tenants } from "../db/schema.js";
import { insertOwnerMembershipForNewTenant, type MembershipRow } from "./membershipsRepo.js";
import { insertStoreForNewTenant, type StoreRow } from "./storesRepo.js";
import type { TenantScope } from "./tenantScope.js";

export type TenantRow = typeof tenants.$inferSelect;

/**
 * Creates a tenant, its store shell, and the founding Store Owner membership
 * in one transaction (rule: multi-record business operations are
 * transactional). Runs before any TenantScope exists for the new tenant, so
 * it isn't part of the scoped factory below - same reasoning as
 * storesRepo.insertStoreForNewTenant.
 */
export async function createTenantWithOwner(
  db: Database,
  input: { name: string; slug: string; ownerUserId: string; ownerRoleId: string },
): Promise<{ tenant: TenantRow; store: StoreRow; membership: MembershipRow }> {
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: input.name, slug: input.slug, status: "pending_approval" })
      .returning();
    if (!tenant) throw new Error("failed to create tenant");

    const store = await insertStoreForNewTenant(tx, {
      tenantId: tenant.id,
      name: input.name,
      slug: input.slug,
    });

    const membership = await insertOwnerMembershipForNewTenant(tx, {
      tenantId: tenant.id,
      userId: input.ownerUserId,
      roleId: input.ownerRoleId,
    });

    return { tenant, store, membership };
  });
}

/** A member reading their own tenant - scoped by `id = scope.tenantId`, the tenants-table equivalent of a tenant_id filter. */
export function createTenantsRepo(db: Database, scope: TenantScope) {
  return {
    async getOwn(): Promise<TenantRow | null> {
      const [row] = await db.select().from(tenants).where(eq(tenants.id, scope.tenantId)).limit(1);
      return row ?? null;
    },
  };
}

export type TenantsRepo = ReturnType<typeof createTenantsRepo>;

// --- Admin (cross-tenant) reads/writes. Never call these directly from a
// route without having gone through requireAdminPermission + an audit log
// write - see middleware/requireAdminPermission.ts and repositories/adminScopedRepo.ts. ---

export async function adminGetTenantById(db: Database, id: string): Promise<TenantRow | null> {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return row ?? null;
}

export async function adminListTenants(db: Database, status?: TenantStatus): Promise<TenantRow[]> {
  if (status) {
    return db.select().from(tenants).where(eq(tenants.status, status));
  }
  return db.select().from(tenants);
}

/**
 * Activates both the tenant AND its store in one transaction - stores.status
 * is a separate field (draft/pending_approval/active/suspended) from
 * tenants.status, and the public storefront only ever serves an active
 * store. Approving the tenant without also activating its store would leave
 * the storefront permanently 404, even though the tenant looks "active"
 * everywhere else.
 */
export async function adminApproveTenant(
  db: Database,
  id: string,
  approvedBy: string,
): Promise<TenantRow | null> {
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .update(tenants)
      .set({ status: "active", approvedAt: new Date(), approvedBy, updatedAt: new Date() })
      .where(and(eq(tenants.id, id), eq(tenants.status, "pending_approval")))
      .returning();
    if (!tenant) return null;

    await tx.update(stores).set({ status: "active", updatedAt: new Date() }).where(eq(stores.tenantId, id));

    return tenant;
  });
}

export async function adminRejectTenant(db: Database, id: string): Promise<TenantRow | null> {
  const [row] = await db
    .update(tenants)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(tenants.id, id), eq(tenants.status, "pending_approval")))
    .returning();
  return row ?? null;
}

/** Also suspends the store, in the same transaction - it must stop being publicly reachable immediately. */
export async function adminSuspendTenant(db: Database, id: string): Promise<TenantRow | null> {
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .update(tenants)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(and(eq(tenants.id, id), eq(tenants.status, "active")))
      .returning();
    if (!tenant) return null;

    await tx.update(stores).set({ status: "suspended", updatedAt: new Date() }).where(eq(stores.tenantId, id));

    return tenant;
  });
}
