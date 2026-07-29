/**
 * Swappable transport for judging genuine relevance of already-filtered
 * marketplace candidates against a customer's natural-language query,
 * mirroring IntentParser/ImageStorage/EmailProvider. Unlike IntentParser
 * (query -> filters, no catalog visibility), this reads the actual
 * candidate products' text and reasons about fit - closer to how a person
 * (or an LLM in conversation) judges relevance than filter-matching alone.
 */
export interface RankableProduct {
  id: string;
  name: string;
  description: string | null;
  subcategory: string | null;
  gender: string | null;
  style: string | null;
  occasion: string | null;
  season: string | null;
  fit: string | null;
  material: string | null;
  brand: string | null;
}

export interface ResultRanker {
  /**
   * Always resolves to a valid ordering - never throws. Implementations
   * degrade to the candidates' original id order (unfiltered) on any
   * internal failure, so callers never need their own try/catch.
   */
  rank(query: string, candidates: RankableProduct[]): Promise<string[]>;
}
