import type { NextFunction, Request, Response } from "express";
import type { PermissionKey } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { resolveAdminContext } from "../repositories/adminScopedRepo.js";

/** Requires requireAuth to have run first. Gates every /admin/* route. */
export function requireAdminPermission(deps: AppDependencies, permission: PermissionKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      next(new UnauthorizedError("authentication required"));
      return;
    }

    const adminContext = await resolveAdminContext(deps.db, req.userId);
    if (!adminContext || !adminContext.permissions.includes(permission)) {
      next(new ForbiddenError("insufficient permissions"));
      return;
    }

    req.adminContext = adminContext;
    next();
  };
}
