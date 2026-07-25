import type { NextFunction, Request, Response } from "express";
import type { PermissionKey } from "@fashion-platform/shared-types";
import { hasPermission } from "@fashion-platform/domain-shared";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

/** Requires resolveTenantContext to have run first. */
export function requirePermission(permission: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenantContext) {
      next(new UnauthorizedError("tenant context not resolved"));
      return;
    }
    if (!hasPermission(req.tenantContext.permissions, permission)) {
      next(new ForbiddenError("insufficient permissions"));
      return;
    }
    next();
  };
}
