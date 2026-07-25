import { and, eq } from "drizzle-orm";
import type { ProductVariantStatus } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { productVariants } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type ProductVariantRow = typeof productVariants.$inferSelect;

export interface CreateProductVariantInput {
  sku: string;
  size?: string | null | undefined;
  color?: string | null | undefined;
  priceCents: number;
}

export interface UpdateProductVariantInput {
  sku?: string | undefined;
  size?: string | null | undefined;
  color?: string | null | undefined;
  priceCents?: number | undefined;
  status?: ProductVariantStatus | undefined;
}

/** Tenant-owned. Every method is scoped to `scope.tenantId` - see tenantScope.ts. */
export function createProductVariantsRepo(db: Database, scope: TenantScope) {
  return {
    async listForProduct(productId: string): Promise<ProductVariantRow[]> {
      return db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.productId, productId), eq(productVariants.tenantId, scope.tenantId)));
    },

    async findById(variantId: string): Promise<ProductVariantRow | null> {
      const [row] = await db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.id, variantId), eq(productVariants.tenantId, scope.tenantId)))
        .limit(1);
      return row ?? null;
    },

    async create(productId: string, input: CreateProductVariantInput): Promise<ProductVariantRow> {
      const [row] = await db
        .insert(productVariants)
        .values({
          tenantId: scope.tenantId,
          productId,
          sku: input.sku,
          size: input.size ?? null,
          color: input.color ?? null,
          priceCents: input.priceCents,
        })
        .returning();
      if (!row) throw new Error("failed to create product variant");
      return row;
    },

    async update(variantId: string, input: UpdateProductVariantInput): Promise<ProductVariantRow | null> {
      const [row] = await db
        .update(productVariants)
        .set({
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.size !== undefined ? { size: input.size } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(productVariants.id, variantId), eq(productVariants.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },

    /** Soft delete: sets status to archived. */
    async archive(variantId: string): Promise<ProductVariantRow | null> {
      const [row] = await db
        .update(productVariants)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(productVariants.id, variantId), eq(productVariants.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },
  };
}

export type ProductVariantsRepo = ReturnType<typeof createProductVariantsRepo>;
