import { Router } from "express";
import { PERMISSION_KEYS } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { UnauthorizedError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { getTenantAnalytics } from "../repositories/tenantAnalyticsRepo.js";

export function createAnalyticsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/:id/analytics",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.ORDER_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const analytics = await getTenantAnalytics(deps.db, { tenantId: req.tenantContext.tenantId });
      res.status(200).json(analytics);
    }),
  );

  return router;
}
