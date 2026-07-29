import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
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
  /** AI-derived free-text fallback for anything not captured by the structured fields below - matched the same way as `search`. */
  keywords?: string | undefined;
  subcategory?: string | undefined;
  gender?: string | undefined;
  style?: string | undefined;
  occasion?: string | undefined;
  season?: string | undefined;
  fit?: string | undefined;
  material?: string | undefined;
  brand?: string | undefined;
  minPriceCents?: number | undefined;
  maxPriceCents?: number | undefined;
  limit?: number | undefined;
}

/**
 * Fuzzy (ilike), not exact, matching on every structured attribute - these
 * are free-text fields with no controlled vocabulary (a merchant could type
 * "Wedding" or "weddings"), so exact eq() would silently miss real matches.
 */
const STRUCTURED_TEXT_FIELDS = ["subcategory", "gender", "style", "occasion", "season", "fit", "material", "brand"] as const;

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

  const textQuery = filter.keywords ?? filter.search;
  if (textQuery) {
    conditions.push(
      or(ilike(products.name, `%${textQuery}%`), ilike(products.description, `%${textQuery}%`))!,
    );
  }

  for (const field of STRUCTURED_TEXT_FIELDS) {
    const value = filter[field];
    if (value) conditions.push(ilike(products[field], `%${value}%`));
  }

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

  const results = rows.map((row) => ({
    id: row.product.id,
    name: row.product.name,
    slug: row.product.slug,
    imageUrl: row.product.imageUrl,
    priceCentsFrom: priceByProductId.get(row.product.id) ?? null,
    storeSlug: row.storeSlug,
    storeName: row.storeName,
  }));

  // Price-range filtering happens here, after the price lookup above, rather
  // than as a SQL rewrite of the aggregation query - simple and correct at
  // this catalog's scale; would move into SQL if the marketplace grew large.
  return results.filter((product) => {
    if (product.priceCentsFrom === null) return true;
    if (filter.minPriceCents !== undefined && product.priceCentsFrom < filter.minPriceCents) return false;
    if (filter.maxPriceCents !== undefined && product.priceCentsFrom > filter.maxPriceCents) return false;
    return true;
  });
}
