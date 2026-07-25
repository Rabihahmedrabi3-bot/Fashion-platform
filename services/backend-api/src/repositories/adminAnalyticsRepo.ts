import { desc, eq, ne, sql } from "drizzle-orm";
import type { OrderStatus, PlatformAnalytics, TenantStatus } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { orderItems, orders, tenants } from "../db/schema.js";

const TENANT_STATUSES: TenantStatus[] = ["pending_approval", "active", "suspended", "rejected"];
const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "fulfilled", "delivered", "cancelled"];

/**
 * Platform-wide, cross-tenant aggregates - only reachable through the
 * explicit admin path (routes/admin/analytics.ts), never per-tenant. Real
 * SQL over real order data; nothing here is a placeholder number.
 * Revenue and top-products deliberately exclude cancelled orders - a
 * cancelled order was never real revenue.
 */
export async function getPlatformAnalytics(db: Database): Promise<PlatformAnalytics> {
  const tenantStatusRows = await db
    .select({ status: tenants.status, count: sql<number>`count(*)::int` })
    .from(tenants)
    .groupBy(tenants.status);
  const tenantsByStatus = Object.fromEntries(TENANT_STATUSES.map((status) => [status, 0])) as Record<
    TenantStatus,
    number
  >;
  for (const row of tenantStatusRows) tenantsByStatus[row.status] = row.count;

  const orderStatusRows = await db
    .select({ status: orders.status, count: sql<number>`count(*)::int` })
    .from(orders)
    .groupBy(orders.status);
  const ordersByStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<
    OrderStatus,
    number
  >;
  for (const row of orderStatusRows) ordersByStatus[row.status] = row.count;

  const [revenueRow] = await db
    .select({
      totalOrders: sql<number>`count(*)::int`,
      totalRevenueCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
    })
    .from(orders)
    .where(ne(orders.status, "cancelled"));

  const topProductRows = await db
    .select({
      productName: orderItems.productNameSnapshot,
      tenantId: orderItems.tenantId,
      tenantName: tenants.name,
      quantitySold: sql<number>`sum(${orderItems.quantity})::int`,
      revenueCents: sql<number>`sum(${orderItems.lineTotalCents})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(tenants, eq(orderItems.tenantId, tenants.id))
    .where(ne(orders.status, "cancelled"))
    .groupBy(orderItems.productNameSnapshot, orderItems.tenantId, tenants.name)
    .orderBy(desc(sql`sum(${orderItems.lineTotalCents})`))
    .limit(10);

  return {
    tenantsByStatus,
    ordersByStatus,
    totalOrders: revenueRow?.totalOrders ?? 0,
    totalRevenueCents: revenueRow?.totalRevenueCents ?? 0,
    topProducts: topProductRows,
  };
}
