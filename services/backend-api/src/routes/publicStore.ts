import { Router } from "express";
import { publicProductsQuerySchema } from "@fashion-platform/validation";
import type { PublicStoreResponse } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import type { Database } from "../db/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { NotFoundError } from "../lib/errors.js";
import { requireParam } from "../lib/params.js";
import { normalizeThemeConfig } from "../lib/themeConfig.js";
import {
  findPublicProductBySlug,
  listPublicCategories,
  listPublicProducts,
} from "../repositories/publicCatalogRepo.js";
import { findPublicStoreBySlug, type StoreRow } from "../repositories/storesRepo.js";

/** Generic 404 - never distinguish "doesn't exist" from "exists but pending/suspended" (Increment 1 rule). */
async function resolveActiveStoreOrNotFound(db: Database, slug: string): Promise<StoreRow> {
  const store = await findPublicStoreBySlug(db, slug);
  if (!store) throw new NotFoundError("store not found");
  return store;
}

export function createPublicStoreRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/:slug",
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const response: PublicStoreResponse = {
        name: store.name,
        slug: store.slug,
        brandingLogoUrl: store.brandingLogoUrl,
        brandingPrimaryColor: store.brandingPrimaryColor,
        brandingThemeConfig: normalizeThemeConfig(store.brandingThemeConfig),
      };
      res.status(200).json(response);
    }),
  );

  router.get(
    "/:slug/categories",
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      res.status(200).json(await listPublicCategories(deps.db, store.tenantId));
    }),
  );

  router.get(
    "/:slug/products",
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const query = publicProductsQuerySchema.parse(req.query);
      res.status(200).json(
        await listPublicProducts(deps.db, store.tenantId, {
          categorySlug: query.category,
          collectionSlug: query.collection,
          limit: query.limit,
        }),
      );
    }),
  );

  router.get(
    "/:slug/products/:productSlug",
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const productSlug = requireParam(req.params, "productSlug");
      const product = await findPublicProductBySlug(deps.db, store.tenantId, productSlug);
      if (!product) throw new NotFoundError("product not found");
      res.status(200).json(product);
    }),
  );

  return router;
}
