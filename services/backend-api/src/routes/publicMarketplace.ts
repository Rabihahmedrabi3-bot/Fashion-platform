import type { MarketplaceProductSummary } from "@fashion-platform/shared-types";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { marketplaceProductsQuerySchema } from "@fashion-platform/validation";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  listMarketplaceProducts,
  type ListMarketplaceProductsFilter,
  type MarketplaceProductWithDetails,
} from "../repositories/publicMarketplaceRepo.js";

/**
 * Independent of the caller-supplied `limit` (up to 100 per marketplaceProductsQuerySchema) -
 * sending 100 full candidates (each up to a 5000-char description) to the ranker on every
 * request would be a real cost/latency spike a client could trigger just by passing a high
 * limit. This caps what actually reaches the ranker, not what the base query can return.
 */
const MAX_RANKING_CANDIDATES = 30;

function toPublicSummary(product: MarketplaceProductWithDetails): MarketplaceProductSummary {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    imageUrl: product.imageUrl,
    priceCentsFrom: product.priceCentsFrom,
    storeSlug: product.storeSlug,
    storeName: product.storeName,
  };
}

export function createPublicMarketplaceRouter(deps: AppDependencies): Router {
  const router = Router();

  // Generous limit - legitimate marketplace browsing shouldn't be capped hard - but this
  // endpoint can trigger a paid external AI API call per request via aiQuery, so it isn't unlimited.
  // Scoped per server instance (not a module-level singleton), same convention as the auth limiter.
  const marketplaceRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });
  router.use(marketplaceRateLimiter);

  router.get(
    "/products",
    asyncHandler(async (req, res) => {
      const query = marketplaceProductsQuerySchema.parse(req.query);

      const filter: ListMarketplaceProductsFilter = { search: query.search, limit: query.limit };
      if (query.aiQuery) {
        const parsed = await deps.intentParser.parseSearchQuery(query.aiQuery);
        Object.assign(filter, parsed);
        // Logged unconditionally (not just on error) - the only way to tell, after the
        // fact, whether a bad marketplace result came from Claude mis-extracting a filter
        // versus every other stage in this pipeline. Cheap at this endpoint's rate-limited
        // volume (30 req/15min); see Render's backend-api logs to check what Claude actually
        // returned for a given query.
        console.log("[marketplace aiQuery]", JSON.stringify({ query: query.aiQuery, filters: parsed }));
      }

      let candidates = await listMarketplaceProducts(deps.db, filter);

      // Ranking only applies to the AI path (the plain `search` box has no query text
      // beyond the literal filter it already ran) and only when there's more than one
      // candidate to actually reorder/filter - a single weak match from SQL filtering
      // is never quality-checked, a deliberate tradeoff rather than an oversight.
      if (query.aiQuery && candidates.length > 1) {
        const toRank = candidates.slice(0, MAX_RANKING_CANDIDATES);
        const orderedIds = await deps.resultRanker.rank(query.aiQuery, toRank);
        const byId = new Map(toRank.map((c) => [c.id, c]));
        const seen = new Set<string>();
        const reranked = orderedIds
          .filter((id) => byId.has(id) && !seen.has(id) && seen.add(id))
          .map((id) => byId.get(id)!);
        console.log(
          "[marketplace rank]",
          JSON.stringify({ candidateIds: toRank.map((c) => c.id), orderedIds, keptCount: reranked.length }),
        );
        // If ranking produced nothing usable (e.g. every id was a hallucination),
        // fall back to the original filtered set rather than returning nothing -
        // ranking can only ever narrow/reorder what filtering already found.
        if (reranked.length > 0) candidates = reranked;
      }

      res.status(200).json(candidates.map(toPublicSummary));
    }),
  );

  return router;
}
