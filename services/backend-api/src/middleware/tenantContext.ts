import type { NextFunction, Request, Response } from "express";
import type { AppDependencies } from "../appDependencies.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { requireParam } from "../lib/params.js";
import { findActiveMembershipForUserAndTenant } from "../repositories/membershipsRepo.js";
import { createPermissionsRepo } from "../repositories/permissionsRepo.js";

/**
 * Resolves tenant context fresh from the DB on every request, from the
 * authenticated user + the tenant id in the route (never from a client-
 * supplied "trust me" field). No active membership -> 403, not 404: the
 * tenant may well exist, the caller just isn't authorized for it
 * (docs/milestone-0-implementation-spec.md §6).
 */
export function resolveTenantContext(deps: AppDependencies, paramName = "id") {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      next(new UnauthorizedError("authentication required"));
      return;
    }

    const tenantId = requireParam(req.params, paramName);

    const membership = await findActiveMembershipForUserAndTenant(deps.db, req.userId, tenantId);
    if (!membership) {
      next(new ForbiddenError("not authorized for this tenant"));
      return;
    }

    const permissionsRepo = createPermissionsRepo(deps.db);
    const permissions = await permissionsRepo.getPermissionKeysForRole(membership.roleId);

    req.tenantContext = {
      userId: req.userId,
      tenantId,
      membershipId: membership.id,
      roleKey: membership.roleKey,
      permissions,
    };
    next();
  };
}
