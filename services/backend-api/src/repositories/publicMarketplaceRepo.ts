import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import type { MarketplaceProductSummary } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { productVariants, products, stores } from "../db/schema.js";

/**
 * Plain functions, not tenant-scoped: a no-auth, cross-tenant read gated on
 * stores.marketplaceEligible - the marketplace-specific counterpart to
 * publicCatalogRepo.ts's single-store listing. Every query filters
 * products.status = 'active' AND stores.marketplaceEligible = true
 * AND stores.status = 'active' - no other gate exists here.
 */

export interface ListMarketplaceProductsFilter {
  search?: string | undefined;
  limit?: number | undefined;
}

/** Returns a cheapest-active-variant price per product, same as listPublicProducts. */
export async function listMarketplaceProducts(
  db: Database,
  filter: ListMarketplaceProductsFilter,
): Promise<MarketplaceProductSummary[]> {
  const conditions = [
    eq(products.status, "active" as const),
    eq(stores.marketplaceEligible, true),
    eq(stores.status, "active" as const),
  ];
  if (filter.search) conditions.push(ilike(products.name, `%${filter.search}%`));

  const limit = filter.limit ?? 24;

  const rows = await db
    .select({ product: products, storeSlug: stores.slug, storeName: stores.name })
    .from(products)
    .innerJoin(stores, eq(products.tenantId, stores.tenantId))
    .where(and(...conditions))
    .limit(limit);

  if (rows.length === 0) return [];

  const productIds = rows.map((row) => row.product.id);
  const prices = await db
    .select({ productId: productVariants.productId, minPrice: sql<number>`min(${productVariants.priceCents})::int` })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, productIds), eq(productVariants.status, "active")))
    .groupBy(productVariants.productId);
  const priceByProductId = new Map(prices.map((row) => [row.productId, row.minPrice]));

  return rows.map((row) => ({
    id: row.product.id,
    name: row.product.name,
    slug: row.product.slug,
    imageUrl: row.product.imageUrl,
    priceCentsFrom: priceByProductId.get(row.product.id) ?? null,
    storeSlug: row.storeSlug,
    storeName: row.storeName,
  }));
}
