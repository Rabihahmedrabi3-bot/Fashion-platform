import { Router } from "express";
import type { MeResponse } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { UnauthorizedError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { resolveAdminContext } from "../repositories/adminScopedRepo.js";
import { findMembershipsWithTenantForUser } from "../repositories/membershipsRepo.js";
import { createUsersRepo } from "../repositories/usersRepo.js";

export function createUsersRouter(deps: AppDependencies): Router {
  const router = Router();
  const usersRepo = createUsersRepo(deps.db);

  router.get(
    "/me",
    requireAuth(deps),
    asyncHandler(async (req, res) => {
      if (!req.userId) throw new UnauthorizedError("authentication required");
      const user = await usersRepo.findById(req.userId);
      if (!user) throw new UnauthorizedError("authentication required");

      const [memberships, adminContext] = await Promise.all([
        findMembershipsWithTenantForUser(deps.db, user.id),
        resolveAdminContext(deps.db, user.id),
      ]);

      const response: MeResponse = {
        user: { id: user.id, email: user.email, fullName: user.fullName, status: user.status },
        memberships: memberships.map((membership) => ({
          tenantId: membership.tenantId,
          tenantName: membership.tenantName,
          tenantSlug: membership.tenantSlug,
          roleKey: membership.roleKey,
          membershipStatus: membership.status,
        })),
        isPlatformAdmin: adminContext !== null,
      };
      res.status(200).json(response);
    }),
  );

  return router;
}
