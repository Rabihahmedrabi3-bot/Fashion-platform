import { Router } from "express";
import {
  createCollectionRequestSchema,
  updateCollectionRequestSchema,
  type CreateCollectionRequestInput,
  type UpdateCollectionRequestInput,
} from "@fashion-platform/validation";
import { PERMISSION_KEYS } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isUniqueViolation } from "../lib/dbErrors.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { requireParam } from "../lib/params.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { createCollectionsRepo } from "../repositories/collectionsRepo.js";

export function createCollectionsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/:id/collections",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const repo = createCollectionsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      res.status(200).json(await repo.list());
    }),
  );

  router.post(
    "/:id/collections",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_CREATE),
    validateBody(createCollectionRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const repo = createCollectionsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const input = req.body as CreateCollectionRequestInput;
      try {
        const collection = await repo.create(input);
        res.status(201).json(collection);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("a collection with this slug already exists");
        throw error;
      }
    }),
  );

  router.patch(
    "/:id/collections/:collectionId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_UPDATE),
    validateBody(updateCollectionRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const repo = createCollectionsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const collectionId = requireParam(req.params, "collectionId");
      const input = req.body as UpdateCollectionRequestInput;
      try {
        const collection = await repo.update(collectionId, input);
        if (!collection) throw new NotFoundError("collection not found");
        res.status(200).json(collection);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("a collection with this slug already exists");
        throw error;
      }
    }),
  );

  router.delete(
    "/:id/collections/:collectionId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_DELETE),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const repo = createCollectionsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const collectionId = requireParam(req.params, "collectionId");
      const removed = await repo.remove(collectionId);
      if (!removed) throw new NotFoundError("collection not found");
      res.status(204).send();
    }),
  );

  return router;
}
