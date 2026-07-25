import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { AuditActorType } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { auditLogs } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type AuditLogRow = typeof auditLogs.$inferSelect;

export interface WriteAuditLogInput {
  actorUserId: string | null;
  actorType: AuditActorType;
  action: string;
  targetType: string;
  targetId: string;
  tenantId: string | null;
  metadata?: Record<string, unknown>;
}

/** Append-only; every admin cross-tenant action and every tenant-approval action writes exactly one row. */
export async function writeAuditLog(db: Database, input: WriteAuditLogInput): Promise<AuditLogRow> {
  const [row] = await db
    .insert(auditLogs)
    .values({
      actorUserId: input.actorUserId,
      actorType: input.actorType,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      tenantId: input.tenantId,
      metadata: input.metadata ?? {},
    })
    .returning();
  if (!row) throw new Error("failed to write audit log");
  return row;
}

/** Tenant-owned read: a tenant's own staff can only see their own tenant's audit trail. */
export async function listAuditLogsForTenant(db: Database, scope: TenantScope): Promise<AuditLogRow[]> {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.tenantId, scope.tenantId))
    .orderBy(desc(auditLogs.createdAt));
}

export interface AdminAuditLogFilters {
  tenantId?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/** Admin-only cross-tenant read - gate with requireAdminPermission before calling. */
export async function adminListAuditLogs(db: Database, filters: AdminAuditLogFilters): Promise<AuditLogRow[]> {
  const conditions = [
    filters.tenantId ? eq(auditLogs.tenantId, filters.tenantId) : undefined,
    filters.actorUserId ? eq(auditLogs.actorUserId, filters.actorUserId) : undefined,
    filters.from ? gte(auditLogs.createdAt, filters.from) : undefined,
    filters.to ? lte(auditLogs.createdAt, filters.to) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

  const query = db
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  return query;
}
