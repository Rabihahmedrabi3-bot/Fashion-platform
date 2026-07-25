import { Router } from "express";
import { PERMISSION_KEYS } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../../appDependencies.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdminPermission } from "../../middleware/requireAdminPermission.js";
import { getPlatformAnalytics } from "../../repositories/adminAnalyticsRepo.js";

/**
 * Gated on AUDIT_READ, the existing platform-oversight permission every
 * super_admin already holds - a dedicated ANALYTICS_READ key would be one
 * more permission with an identical grant list, not worth the duplication.
 */
export function createAdminAnalyticsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth(deps),
    requireAdminPermission(deps, PERMISSION_KEYS.AUDIT_READ),
    asyncHandler(async (_req, res) => {
      res.status(200).json(await getPlatformAnalytics(deps.db));
    }),
  );

  return router;
}
