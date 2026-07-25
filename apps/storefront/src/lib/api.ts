// Plain server-side fetch helpers, not @fashion-platform/api-client: every
// endpoint here is public (no auth token lifecycle to manage), and these run
// in React Server Components where Next's own fetch is the idiomatic choice
// (this is the whole reason the storefront is Next.js rather than Vite - SSR
// for real SEO on public product pages).

import type {
  PublicCategory,
  PublicProductDetail,
  PublicProductSummary,
  PublicStoreResponse,
} from "@fashion-platform/shared-types";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request to ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

export async function getStore(slug: string): Promise<PublicStoreResponse | null> {
  return getJson<PublicStoreResponse>(`/public/stores/${slug}`);
}

export interface ListProductsFilter {
  category?: string | undefined;
  collection?: string | undefined;
  limit?: number | undefined;
}

export async function listProducts(slug: string, filter: ListProductsFilter = {}): Promise<PublicProductSummary[]> {
  const params = new URLSearchParams();
  if (filter.category) params.set("category", filter.category);
  if (filter.collection) params.set("collection", filter.collection);
  if (filter.limit) params.set("limit", String(filter.limit));
  const suffix = params.toString();

  const result = await getJson<PublicProductSummary[]>(`/public/stores/${slug}/products${suffix ? `?${suffix}` : ""}`);
  return result ?? [];
}

export async function getProduct(slug: string, productSlug: string): Promise<PublicProductDetail | null> {
  return getJson<PublicProductDetail>(`/public/stores/${slug}/products/${productSlug}`);
}

export async function listCategories(slug: string): Promise<PublicCategory[]> {
  const result = await getJson<PublicCategory[]>(`/public/stores/${slug}/categories`);
  return result ?? [];
}
