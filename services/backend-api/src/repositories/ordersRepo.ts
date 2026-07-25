import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { OrderStatus } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { orderItems, orders } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;

export interface CreateOrderInput {
  customerId: string;
  subtotalCents: number;
  totalCents: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2?: string | null | undefined;
  shippingCity: string;
  shippingRegion?: string | null | undefined;
  shippingPostalCode?: string | null | undefined;
  shippingCountry: string;
  customerNote?: string | null | undefined;
}

export interface CreateOrderItemInput {
  variantId: string;
  productNameSnapshot: string;
  variantSkuSnapshot: string;
  variantSizeSnapshot?: string | null | undefined;
  variantColorSnapshot?: string | null | undefined;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface ListOrdersFilter {
  status?: OrderStatus | undefined;
  customerId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/** Tenant-owned. Every method is scoped to `scope.tenantId` - see tenantScope.ts. */
export function createOrdersRepo(db: Database, scope: TenantScope) {
  return {
    async create(input: CreateOrderInput): Promise<OrderRow> {
      const [row] = await db
        .insert(orders)
        .values({
          tenantId: scope.tenantId,
          customerId: input.customerId,
          subtotalCents: input.subtotalCents,
          totalCents: input.totalCents,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          shippingAddressLine1: input.shippingAddressLine1,
          shippingAddressLine2: input.shippingAddressLine2 ?? null,
          shippingCity: input.shippingCity,
          shippingRegion: input.shippingRegion ?? null,
          shippingPostalCode: input.shippingPostalCode ?? null,
          shippingCountry: input.shippingCountry,
          customerNote: input.customerNote ?? null,
        })
        .returning();
      if (!row) throw new Error("failed to create order");
      return row;
    },

    async createItems(orderId: string, items: CreateOrderItemInput[]): Promise<OrderItemRow[]> {
      if (items.length === 0) return [];
      return db
        .insert(orderItems)
        .values(
          items.map((item) => ({
            tenantId: scope.tenantId,
            orderId,
            variantId: item.variantId,
            productNameSnapshot: item.productNameSnapshot,
            variantSkuSnapshot: item.variantSkuSnapshot,
            variantSizeSnapshot: item.variantSizeSnapshot ?? null,
            variantColorSnapshot: item.variantColorSnapshot ?? null,
            unitPriceCents: item.unitPriceCents,
            quantity: item.quantity,
            lineTotalCents: item.lineTotalCents,
          })),
        )
        .returning();
    },

    async findById(id: string): Promise<OrderRow | null> {
      const [row] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.tenantId, scope.tenantId)))
        .limit(1);
      return row ?? null;
    },

    async listItems(orderId: string): Promise<OrderItemRow[]> {
      return db
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, scope.tenantId)));
    },

    async listItemsForOrders(orderIds: string[]): Promise<OrderItemRow[]> {
      if (orderIds.length === 0) return [];
      return db
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.tenantId, scope.tenantId), inArray(orderItems.orderId, orderIds)));
    },

    /** List view returns an item count, not the full item payload per row - same pattern as productsRepo.list. */
    async list(filter: ListOrdersFilter): Promise<Array<OrderRow & { itemCount: number }>> {
      const conditions: SQL[] = [eq(orders.tenantId, scope.tenantId)];
      if (filter.status) conditions.push(eq(orders.status, filter.status));
      if (filter.customerId) conditions.push(eq(orders.customerId, filter.customerId));

      const limit = filter.limit ?? 50;
      const offset = filter.offset ?? 0;

      const rows = await db
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset);

      if (rows.length === 0) return [];

      const counts = await db
        .select({ orderId: orderItems.orderId, count: sql<number>`count(*)::int` })
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            rows.map((row) => row.id),
          ),
        )
        .groupBy(orderItems.orderId);
      const countByOrderId = new Map(counts.map((row) => [row.orderId, row.count]));

      return rows.map((row) => ({ ...row, itemCount: countByOrderId.get(row.id) ?? 0 }));
    },

    async updateStatus(
      id: string,
      status: OrderStatus,
      extra: { cancelledAt?: Date; deliveredAt?: Date } = {},
    ): Promise<OrderRow | null> {
      const [row] = await db
        .update(orders)
        .set({ status, ...extra, updatedAt: new Date() })
        .where(and(eq(orders.id, id), eq(orders.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },
  };
}

export type OrdersRepo = ReturnType<typeof createOrdersRepo>;
