import { Router } from "express";
import {
  createTenantRequestSchema,
  updateStoreRequestSchema,
  type CreateTenantRequestInput,
  type UpdateStoreRequestInput,
} from "@fashion-platform/validation";
import { PERMISSION_KEYS, SYSTEM_ROLE_KEYS } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isUniqueViolation } from "../lib/dbErrors.js";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { normalizeThemeConfig } from "../lib/themeConfig.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { createPlatformSettingsRepo } from "../repositories/platformSettingsRepo.js";
import { createRolesRepo } from "../repositories/rolesRepo.js";
import { createStoresRepo } from "../repositories/storesRepo.js";
import { createTenantsRepo, createTenantWithOwner } from "../repositories/tenantsRepo.js";

export function createTenantsRouter(deps: AppDependencies): Router {
  const router = Router();
  const rolesRepo = createRolesRepo(deps.db);

  router.post(
    "/",
    requireAuth(deps),
    validateBody(createTenantRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.userId) throw new UnauthorizedError("authentication required");
      const { name, slug } = req.body as CreateTenantRequestInput;

      const settings = await createPlatformSettingsRepo(deps.db).get();
      if (!settings.tenantRegistrationOpen) {
        throw new ForbiddenError("new store registration is currently closed");
      }

      const ownerRole = await rolesRepo.findSystemRoleByKey(SYSTEM_ROLE_KEYS.STORE_OWNER);
      if (!ownerRole) {
        throw new Error("store_owner system role is not seeded - run npm run db:seed");
      }

      try {
        const { tenant, store } = await createTenantWithOwner(deps.db, {
          name,
          slug,
          ownerUserId: req.userId,
          ownerRoleId: ownerRole.id,
        });
        res.status(201).json({
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status },
          store: { id: store.id, slug: store.slug, status: store.status },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("a tenant with this slug already exists");
        }
        throw error;
      }
    }),
  );

  router.get(
    "/:id",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.TENANT_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const tenantsRepo = createTenantsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const tenant = await tenantsRepo.getOwn();
      if (!tenant) throw new UnauthorizedError("not authorized for this tenant");
      res.status(200).json({ id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status });
    }),
  );

  router.get(
    "/:id/store",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.STORE_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const storesRepo = createStoresRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const store = await storesRepo.getOwn();
      if (!store) throw new NotFoundError("store not found");
      res.status(200).json({
        id: store.id,
        name: store.name,
        slug: store.slug,
        status: store.status,
        brandingLogoUrl: store.brandingLogoUrl,
        brandingPrimaryColor: store.brandingPrimaryColor,
        brandingThemeConfig: normalizeThemeConfig(store.brandingThemeConfig),
      });
    }),
  );

  router.patch(
    "/:id/store",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.STORE_UPDATE),
    validateBody(updateStoreRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const storesRepo = createStoresRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const input = req.body as UpdateStoreRequestInput;
      const store = await storesRepo.updateOwn(input);
      if (!store) throw new NotFoundError("store not found");
      res.status(200).json({
        id: store.id,
        name: store.name,
        slug: store.slug,
        status: store.status,
        brandingLogoUrl: store.brandingLogoUrl,
        brandingPrimaryColor: store.brandingPrimaryColor,
        brandingThemeConfig: normalizeThemeConfig(store.brandingThemeConfig),
      });
    }),
  );

  return router;
}
