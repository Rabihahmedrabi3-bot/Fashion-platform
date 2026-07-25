import { and, eq, inArray } from "drizzle-orm";
import type { PaymentStatus } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { orderPayments } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type OrderPaymentRow = typeof orderPayments.$inferSelect;

/**
 * Tenant-owned. Deliberately its own repo, not part of ordersRepo - payment
 * status transitions independently of order/fulfillment status (MASTER
 * DIRECTIVE: payment/payout separate from the core order domain).
 */
export function createOrderPaymentsRepo(db: Database, scope: TenantScope) {
  return {
    /** COD only for now - method defaults to "cod" at the schema level. */
    async create(orderId: string, amountCents: number): Promise<OrderPaymentRow> {
      const [row] = await db
        .insert(orderPayments)
        .values({ tenantId: scope.tenantId, orderId, amountCents })
        .returning();
      if (!row) throw new Error("failed to create order payment");
      return row;
    },

    async findForOrder(orderId: string): Promise<OrderPaymentRow | null> {
      const [row] = await db
        .select()
        .from(orderPayments)
        .where(and(eq(orderPayments.orderId, orderId), eq(orderPayments.tenantId, scope.tenantId)))
        .limit(1);
      return row ?? null;
    },

    async findForOrders(orderIds: string[]): Promise<OrderPaymentRow[]> {
      if (orderIds.length === 0) return [];
      return db
        .select()
        .from(orderPayments)
        .where(and(eq(orderPayments.tenantId, scope.tenantId), inArray(orderPayments.orderId, orderIds)));
    },

    async updateStatus(
      orderId: string,
      status: Extract<PaymentStatus, "collected" | "failed">,
    ): Promise<OrderPaymentRow | null> {
      const [row] = await db
        .update(orderPayments)
        .set({ status, collectedAt: status === "collected" ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(orderPayments.orderId, orderId), eq(orderPayments.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },
  };
}

export type OrderPaymentsRepo = ReturnType<typeof createOrderPaymentsRepo>;
