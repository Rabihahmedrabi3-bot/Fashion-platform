import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { ProductStatus } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { productCollections, productVariants, products } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type ProductRow = typeof products.$inferSelect;

export interface ProductTaxonomyInput {
  categoryId?: string | null | undefined;
  subcategory?: string | null | undefined;
  gender?: string | null | undefined;
  style?: string | null | undefined;
  occasion?: string | null | undefined;
  season?: string | null | undefined;
  fit?: string | null | undefined;
  material?: string | null | undefined;
  brand?: string | null | undefined;
  imageUrl?: string | null | undefined;
}

export interface CreateProductInput extends ProductTaxonomyInput {
  name: string;
  slug: string;
  description?: string | undefined;
}

export interface UpdateProductInput extends ProductTaxonomyInput {
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | null | undefined;
  status?: ProductStatus | undefined;
}

export interface ListProductsFilter {
  status?: ProductStatus | undefined;
  categoryId?: string | undefined;
  collectionId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

const TAXONOMY_KEYS = [
  "categoryId",
  "subcategory",
  "gender",
  "style",
  "occasion",
  "season",
  "fit",
  "material",
  "brand",
  "imageUrl",
] as const;

function taxonomyPatch(input: ProductTaxonomyInput): Partial<Record<(typeof TAXONOMY_KEYS)[number], string | null>> {
  const patch: Partial<Record<(typeof TAXONOMY_KEYS)[number], string | null>> = {};
  for (const key of TAXONOMY_KEYS) {
    const value = input[key];
    if (value !== undefined) {
      patch[key] = value;
    }
  }
  return patch;
}

/** Tenant-owned. Every method is scoped to `scope.tenantId` - see tenantScope.ts. */
export function createProductsRepo(db: Database, scope: TenantScope) {
  return {
    async list(filter: ListProductsFilter): Promise<Array<ProductRow & { variantCount: number }>> {
      const conditions: SQL[] = [eq(products.tenantId, scope.tenantId)];
      if (filter.status) conditions.push(eq(products.status, filter.status));
      if (filter.categoryId) conditions.push(eq(products.categoryId, filter.categoryId));

      const limit = filter.limit ?? 50;
      const offset = filter.offset ?? 0;

      let rows: ProductRow[];
      if (filter.collectionId) {
        const joined = await db
          .select({ product: products })
          .from(products)
          .innerJoin(productCollections, eq(productCollections.productId, products.id))
          .where(and(...conditions, eq(productCollections.collectionId, filter.collectionId)))
          .limit(limit)
          .offset(offset);
        rows = joined.map((row) => row.product);
      } else {
        rows = await db
          .select()
          .from(products)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset);
      }

      if (rows.length === 0) return [];

      // One extra query for all variant counts, not N+1 per product.
      const counts = await db
        .select({ productId: productVariants.productId, count: sql<number>`count(*)::int` })
        .from(productVariants)
        .where(
          inArray(
            productVariants.productId,
            rows.map((row) => row.id),
          ),
        )
        .groupBy(productVariants.productId);
      const countByProductId = new Map(counts.map((row) => [row.productId, row.count]));

      return rows.map((row) => ({ ...row, variantCount: countByProductId.get(row.id) ?? 0 }));
    },

    async findById(id: string): Promise<ProductRow | null> {
      const [row] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.tenantId, scope.tenantId)))
        .limit(1);
      return row ?? null;
    },

    async create(input: CreateProductInput): Promise<ProductRow> {
      const [row] = await db
        .insert(products)
        .values({
          tenantId: scope.tenantId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          ...taxonomyPatch(input),
        })
        .returning();
      if (!row) throw new Error("failed to create product");
      return row;
    },

    async update(id: string, input: UpdateProductInput): Promise<ProductRow | null> {
      const [row] = await db
        .update(products)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...taxonomyPatch(input),
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, id), eq(products.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },

    /** Soft delete: sets status to archived, matching the tenants/stores convention. */
    async archive(id: string): Promise<ProductRow | null> {
      const [row] = await db
        .update(products)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(products.id, id), eq(products.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },

    async listCollectionIds(productId: string): Promise<string[]> {
      const rows = await db
        .select({ collectionId: productCollections.collectionId })
        .from(productCollections)
        .where(eq(productCollections.productId, productId));
      return rows.map((row) => row.collectionId);
    },

    async addToCollection(productId: string, collectionId: string): Promise<void> {
      await db.insert(productCollections).values({ productId, collectionId }).onConflictDoNothing();
    },

    async removeFromCollection(productId: string, collectionId: string): Promise<void> {
      await db
        .delete(productCollections)
        .where(and(eq(productCollections.productId, productId), eq(productCollections.collectionId, collectionId)));
    },
  };
}

export type ProductsRepo = ReturnType<typeof createProductsRepo>;
