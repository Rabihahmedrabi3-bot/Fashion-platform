/**
 * Swappable transport for turning a natural-language search query into
 * structured catalog filters, mirroring ImageStorage (lib/imageStorage.ts)
 * and EmailProvider (lib/email.ts). This layer only ever translates intent
 * into filters that get run through a real SQL query - it never generates
 * or invents results itself.
 */
export interface SearchFilters {
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
  keywords?: string | undefined;
}

export interface IntentParser {
  parseSearchQuery(query: string): Promise<SearchFilters>;
}
