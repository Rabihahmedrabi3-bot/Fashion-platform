import type { NextFunction, Request, Response } from "express";
import type { AppDependencies } from "../appDependencies.js";
import { NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { requireParam } from "../lib/params.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { createCustomersRepo } from "../repositories/customersRepo.js";
import { findPublicStoreBySlug } from "../repositories/storesRepo.js";

/**
 * Verifies a customer access token (signed with jwtCustomerAccessSecret, not
 * jwtAccessSecret - see appDependencies.ts) and resolves it against the
 * store named by :slug. Tenant isolation falls out naturally here: the
 * customer lookup is scoped to *this* store's tenantId, so a token issued
 * for a customer at Store A resolves to nothing at Store B even though the
 * token itself is technically well-formed.
 */
export function requireCustomerAuth(deps: AppDependencies) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new UnauthorizedError("missing or invalid Authorization header"));
      return;
    }

    const store = await findPublicStoreBySlug(deps.db, requireParam(req.params, "slug"));
    if (!store) {
      next(new NotFoundError("store not found"));
      return;
    }

    const token = header.slice("Bearer ".length);
    const payload = await verifyAccessToken(token, deps.jwtCustomerAccessSecret);
    if (!payload) {
      next(new UnauthorizedError("invalid or expired access token"));
      return;
    }

    const customer = await createCustomersRepo(deps.db, { tenantId: store.tenantId }).findById(payload.sub);
    if (!customer || customer.tokenVersion !== payload.tokenVersion) {
      next(new UnauthorizedError("invalid or expired access token"));
      return;
    }

    req.customerId = customer.id;
    next();
  };
}
