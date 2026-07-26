import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { OrderStatus, TenantAnalytics } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { orderItems, orders } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "fulfilled", "delivered", "cancelled"];

/**
 * Single-tenant equivalent of adminAnalyticsRepo.getPlatformAnalytics -
 * same query shapes, but every query is scoped to scope.tenantId (see
 * tenantScope.ts), never cross-tenant. Revenue and top-products exclude
 * cancelled orders, same rationale as the platform-wide version.
 */
export async function getTenantAnalytics(db: Database, scope: TenantScope): Promise<TenantAnalytics> {
  const orderStatusRows = await db
    .select({ status: orders.status, count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.tenantId, scope.tenantId))
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
    .where(and(eq(orders.tenantId, scope.tenantId), ne(orders.status, "cancelled")));

  const topProductRows = await db
    .select({
      productName: orderItems.productNameSnapshot,
      quantitySold: sql<number>`sum(${orderItems.quantity})::int`,
      revenueCents: sql<number>`sum(${orderItems.lineTotalCents})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.tenantId, scope.tenantId), ne(orders.status, "cancelled")))
    .groupBy(orderItems.productNameSnapshot)
    .orderBy(desc(sql`sum(${orderItems.lineTotalCents})`))
    .limit(10);

  return {
    ordersByStatus,
    totalOrders: revenueRow?.totalOrders ?? 0,
    totalRevenueCents: revenueRow?.totalRevenueCents ?? 0,
    topProducts: topProductRows,
  };
}
