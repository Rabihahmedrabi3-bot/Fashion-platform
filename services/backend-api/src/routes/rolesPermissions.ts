import { Router } from "express";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { createPermissionsRepo } from "../repositories/permissionsRepo.js";
import { createRolesRepo } from "../repositories/rolesRepo.js";

/** Read-only reference data in Increment 1 - system roles/permissions are seeded, not user-editable. */
export function createRolesRouter(deps: AppDependencies): Router {
  const router = Router();
  const rolesRepo = createRolesRepo(deps.db);

  router.get(
    "/",
    requireAuth(deps),
    asyncHandler(async (_req, res) => {
      const roles = await rolesRepo.listSystemRoles();
      res.status(200).json(roles.map((role) => ({ id: role.id, key: role.key, name: role.name })));
    }),
  );

  return router;
}

export function createPermissionsRouter(deps: AppDependencies): Router {
  const router = Router();
  const permissionsRepo = createPermissionsRepo(deps.db);

  router.get(
    "/",
    requireAuth(deps),
    asyncHandler(async (_req, res) => {
      const permissions = await permissionsRepo.listAll();
      res
        .status(200)
        .json(permissions.map((p) => ({ key: p.key, resource: p.resource, action: p.action, description: p.description })));
    }),
  );

  return router;
}
