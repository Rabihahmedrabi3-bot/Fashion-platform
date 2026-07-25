import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { inventory } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type InventoryRow = typeof inventory.$inferSelect;

/** Tenant-owned. Every method is scoped to `scope.tenantId` - see tenantScope.ts. */
export function createInventoryRepo(db: Database, scope: TenantScope) {
  return {
    async getForVariant(variantId: string): Promise<InventoryRow | null> {
      const [row] = await db
        .select()
        .from(inventory)
        .where(and(eq(inventory.variantId, variantId), eq(inventory.tenantId, scope.tenantId)))
        .limit(1);
      return row ?? null;
    },

    /** Called once, alongside variant creation - a variant always gets an inventory row (default quantity 0). */
    async createForVariant(variantId: string, quantity = 0): Promise<InventoryRow> {
      const [row] = await db
        .insert(inventory)
        .values({ tenantId: scope.tenantId, variantId, quantity })
        .returning();
      if (!row) throw new Error("failed to create inventory row");
      return row;
    },

    /** Absolute set, not a delta ledger - a movement-history table is more than this increment needs. */
    async setQuantity(variantId: string, quantity: number): Promise<InventoryRow | null> {
      const [row] = await db
        .update(inventory)
        .set({ quantity, updatedAt: new Date() })
        .where(and(eq(inventory.variantId, variantId), eq(inventory.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },
  };
}

export type InventoryRepo = ReturnType<typeof createInventoryRepo>;
