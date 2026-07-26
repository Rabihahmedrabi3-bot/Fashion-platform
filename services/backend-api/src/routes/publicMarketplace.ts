import { Router } from "express";
import { marketplaceProductsQuerySchema } from "@fashion-platform/validation";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { listMarketplaceProducts } from "../repositories/publicMarketplaceRepo.js";

export function createPublicMarketplaceRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/products",
    asyncHandler(async (req, res) => {
      const query = marketplaceProductsQuerySchema.parse(req.query);
      res.status(200).json(await listMarketplaceProducts(deps.db, query));
    }),
  );

  return router;
}
