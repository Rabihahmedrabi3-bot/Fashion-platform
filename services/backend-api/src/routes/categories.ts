import { Router } from "express";
import {
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
  type CreateCategoryRequestInput,
  type UpdateCategoryRequestInput,
} from "@fashion-platform/validation";
import { PERMISSION_KEYS } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isForeignKeyViolation, isUniqueViolation } from "../lib/dbErrors.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { requireParam } from "../lib/params.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { createCategoriesRepo } from "../repositories/categoriesRepo.js";

export function createCategoriesRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/:id/categories",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const repo = createCategoriesRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      res.status(200).json(await repo.list());
    }),
  );

  router.post(
    "/:id/categories",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_CREATE),
    validateBody(createCategoryRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const repo = createCategoriesRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const input = req.body as CreateCategoryRequestInput;
      try {
        const category = await repo.create(input);
        res.status(201).json(category);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("a category with this slug already exists");
        throw error;
      }
    }),
  );

  router.patch(
    "/:id/categories/:categoryId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_UPDATE),
    validateBody(updateCategoryRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const repo = createCategoriesRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const categoryId = requireParam(req.params, "categoryId");
      const input = req.body as UpdateCategoryRequestInput;
      try {
        const category = await repo.update(categoryId, input);
        if (!category) throw new NotFoundError("category not found");
        res.status(200).json(category);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("a category with this slug already exists");
        throw error;
      }
    }),
  );

  router.delete(
    "/:id/categories/:categoryId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_DELETE),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const repo = createCategoriesRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const categoryId = requireParam(req.params, "categoryId");
      try {
        const removed = await repo.remove(categoryId);
        if (!removed) throw new NotFoundError("category not found");
        res.status(204).send();
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new ConflictError("category is still assigned to one or more products");
        }
        throw error;
      }
    }),
  );

  return router;
}
