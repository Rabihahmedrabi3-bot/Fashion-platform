import { and, eq, inArray, sql } from "drizzle-orm";
import type { PublicCategory } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { categories, collections, productCollections, productVariants, products } from "../db/schema.js";

/**
 * Plain functions, not tenant-scoped repo factories: these are intentionally
 * cross-request, no-auth reads driven by a store slug rather than an
 * authenticated TenantContext. Every query here explicitly filters
 * status = 'active' - there is no other gate keeping draft/archived catalog
 * data out of these results.
 */

async function resolveCategoryId(db: Database, tenantId: string, slug: string): Promise<string | null> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.tenantId, tenantId), eq(categories.slug, slug)))
    .limit(1);
  return row?.id ?? null;
}

async function resolveCollectionId(db: Database, tenantId: string, slug: string): Promise<string | null> {
  const [row] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.tenantId, tenantId), eq(collections.slug, slug)))
    .limit(1);
  return row?.id ?? null;
}

export interface ListPublicProductsFilter {
  categorySlug?: string | undefined;
  collectionSlug?: string | undefined;
  limit?: number | undefined;
}

/** Returns a cheapest-active-variant price per product, not the full authenticated payload. */
export async function listPublicProducts(db: Database, tenantId: string, filter: ListPublicProductsFilter) {
  const conditions = [eq(products.tenantId, tenantId), eq(products.status, "active" as const)];

  if (filter.categorySlug) {
    const categoryId = await resolveCategoryId(db, tenantId, filter.categorySlug);
    if (!categoryId) return [];
    conditions.push(eq(products.categoryId, categoryId));
  }

  const limit = filter.limit ?? 24;

  let productRows: (typeof products.$inferSelect)[];
  if (filter.collectionSlug) {
    const collectionId = await resolveCollectionId(db, tenantId, filter.collectionSlug);
    if (!collectionId) return [];
    const joined = await db
      .select({ product: products })
      .from(products)
      .innerJoin(productCollections, eq(productCollections.productId, products.id))
      .where(and(...conditions, eq(productCollections.collectionId, collectionId)))
      .limit(limit);
    productRows = joined.map((row) => row.product);
  } else {
    productRows = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .limit(limit);
  }

  if (productRows.length === 0) return [];

  const productIds = productRows.map((row) => row.id);
  const prices = await db
    .select({ productId: productVariants.productId, minPrice: sql<number>`min(${productVariants.priceCents})::int` })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, productIds), eq(productVariants.status, "active")))
    .groupBy(productVariants.productId);
  const priceByProductId = new Map(prices.map((row) => [row.productId, row.minPrice]));

  return productRows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: row.imageUrl,
    priceCentsFrom: priceByProductId.get(row.id) ?? null,
  }));
}

export async function findPublicProductBySlug(db: Database, tenantId: string, slug: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.slug, slug), eq(products.status, "active")))
    .limit(1);
  if (!product) return null;

  const variants = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      size: productVariants.size,
      color: productVariants.color,
      priceCents: productVariants.priceCents,
    })
    .from(productVariants)
    .where(and(eq(productVariants.productId, product.id), eq(productVariants.status, "active")));

  return { ...product, variants };
}

export async function listPublicCategories(db: Database, tenantId: string): Promise<PublicCategory[]> {
  return db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(eq(categories.tenantId, tenantId));
}
