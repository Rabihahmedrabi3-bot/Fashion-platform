import type { NextFunction, Request, Response } from "express";
import type { AppDependencies } from "../appDependencies.js";
import { UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { createUsersRepo } from "../repositories/usersRepo.js";

/** Verifies the access token and rejects suspended users or ones whose tokenVersion has been bumped. */
export function requireAuth(deps: AppDependencies) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new UnauthorizedError("missing or invalid Authorization header"));
      return;
    }

    const token = header.slice("Bearer ".length);
    const payload = await verifyAccessToken(token, deps.jwtAccessSecret);
    if (!payload) {
      next(new UnauthorizedError("invalid or expired access token"));
      return;
    }

    const usersRepo = createUsersRepo(deps.db);
    const user = await usersRepo.findById(payload.sub);
    if (!user || user.status !== "active" || user.tokenVersion !== payload.tokenVersion) {
      next(new UnauthorizedError("invalid or expired access token"));
      return;
    }

    req.userId = user.id;
    next();
  };
}
