import { Router } from "express";
import rateLimit from "express-rate-limit";
import { marketplaceProductsQuerySchema } from "@fashion-platform/validation";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { listMarketplaceProducts, type ListMarketplaceProductsFilter } from "../repositories/publicMarketplaceRepo.js";

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
      }

      res.status(200).json(await listMarketplaceProducts(deps.db, filter));
    }),
  );

  return router;
}
