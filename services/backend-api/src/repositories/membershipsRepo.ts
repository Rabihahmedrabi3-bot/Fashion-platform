import { and, eq } from "drizzle-orm";
import type { TenantMembershipStatus } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { roles, tenantMemberships, tenants, users } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type MembershipRow = typeof tenantMemberships.$inferSelect;

export interface MembershipWithUser extends MembershipRow {
  userEmail: string;
  userFullName: string;
  roleKey: string;
}

/** Tenant-owned. Every method is scoped to `scope.tenantId` - see tenantScope.ts. */
export function createMembershipsRepo(db: Database, scope: TenantScope) {
  return {
    async list(): Promise<MembershipWithUser[]> {
      const rows = await db
        .select({
          membership: tenantMemberships,
          userEmail: users.email,
          userFullName: users.fullName,
          roleKey: roles.key,
        })
        .from(tenantMemberships)
        .innerJoin(users, eq(tenantMemberships.userId, users.id))
        .innerJoin(roles, eq(tenantMemberships.roleId, roles.id))
        .where(eq(tenantMemberships.tenantId, scope.tenantId));
      return rows.map((row) => ({ ...row.membership, userEmail: row.userEmail, userFullName: row.userFullName, roleKey: row.roleKey }));
    },

    async findById(membershipId: string): Promise<MembershipRow | null> {
      const [row] = await db
        .select()
        .from(tenantMemberships)
        .where(and(eq(tenantMemberships.id, membershipId), eq(tenantMemberships.tenantId, scope.tenantId)))
        .limit(1);
      return row ?? null;
    },

    async create(input: { userId: string; roleId: string; invitedBy: string }): Promise<MembershipRow> {
      const [row] = await db
        .insert(tenantMemberships)
        .values({
          tenantId: scope.tenantId,
          userId: input.userId,
          roleId: input.roleId,
          invitedBy: input.invitedBy,
          status: "invited",
        })
        .returning();
      if (!row) throw new Error("failed to create membership");
      return row;
    },

    async updateRoleOrStatus(
      membershipId: string,
      input: { roleId?: string; status?: "active" | "revoked" },
    ): Promise<MembershipRow | null> {
      const [row] = await db
        .update(tenantMemberships)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(tenantMemberships.id, membershipId), eq(tenantMemberships.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },
  };
}

export type MembershipsRepo = ReturnType<typeof createMembershipsRepo>;

/**
 * Creates the auto Store Owner membership at tenant-creation time, before a
 * TenantScope exists for the brand-new tenant - mirrors
 * storesRepo.insertStoreForNewTenant.
 */
export async function insertOwnerMembershipForNewTenant(
  db: Database,
  input: { tenantId: string; userId: string; roleId: string },
): Promise<MembershipRow> {
  const [row] = await db
    .insert(tenantMemberships)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      roleId: input.roleId,
      status: "active",
      invitedBy: null,
    })
    .returning();
  if (!row) throw new Error("failed to create owner membership");
  return row;
}

/**
 * The sanctioned resolution point: given an authenticated user and the
 * tenant implied by the request route, find their active membership (or
 * null). This is how tenantContext middleware turns "user + route" into a
 * TenantScope - it is not a tenant-scoping bypass, it's the thing scope
 * resolution is built on.
 */
export async function findActiveMembershipForUserAndTenant(
  db: Database,
  userId: string,
  tenantId: string,
): Promise<(MembershipRow & { roleKey: string }) | null> {
  const [row] = await db
    .select({ membership: tenantMemberships, roleKey: roles.key })
    .from(tenantMemberships)
    .innerJoin(roles, eq(tenantMemberships.roleId, roles.id))
    .where(
      and(
        eq(tenantMemberships.userId, userId),
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.status, "active"),
      ),
    )
    .limit(1);
  return row ? { ...row.membership, roleKey: row.roleKey } : null;
}

/** Used by GET /users/me to list a user's own memberships across tenants. */
export async function findMembershipsWithTenantForUser(
  db: Database,
  userId: string,
): Promise<
  Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    roleKey: string;
    status: TenantMembershipStatus;
  }>
> {
  const rows = await db
    .select({
      tenantId: tenantMemberships.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      roleKey: roles.key,
      status: tenantMemberships.status,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
    .innerJoin(roles, eq(tenantMemberships.roleId, roles.id))
    .where(eq(tenantMemberships.userId, userId));
  return rows;
}
