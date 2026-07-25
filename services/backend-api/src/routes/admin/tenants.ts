import { Router } from "express";
import {
  listTenantsQuerySchema,
  rejectOrSuspendTenantRequestSchema,
  type RejectOrSuspendTenantRequestInput,
} from "@fashion-platform/validation";
import { PERMISSION_KEYS } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../../appDependencies.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../lib/errors.js";
import { requireParam } from "../../lib/params.js";
import { validateBody } from "../../lib/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdminPermission } from "../../middleware/requireAdminPermission.js";
import { writeAuditLog } from "../../repositories/auditLogsRepo.js";
import {
  adminApproveTenant,
  adminGetTenantById,
  adminListTenants,
  adminRejectTenant,
  adminSuspendTenant,
} from "../../repositories/tenantsRepo.js";

export function createAdminTenantsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth(deps),
    requireAdminPermission(deps, PERMISSION_KEYS.TENANT_READ),
    asyncHandler(async (req, res) => {
      const { status } = listTenantsQuerySchema.parse(req.query);
      const tenantList = await adminListTenants(deps.db, status);
      res
        .status(200)
        .json(tenantList.map((tenant) => ({ id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status })));
    }),
  );

  router.post(
    "/:id/approve",
    requireAuth(deps),
    requireAdminPermission(deps, PERMISSION_KEYS.TENANT_APPROVE),
    asyncHandler(async (req, res) => {
      if (!req.userId) throw new UnauthorizedError("authentication required");
      const id = requireParam(req.params, "id");

      const tenant = await adminApproveTenant(deps.db, id, req.userId);
      if (!tenant) {
        const existing = await adminGetTenantById(deps.db, id);
        if (!existing) throw new NotFoundError("tenant not found");
        throw new ConflictError("tenant is not pending approval");
      }

      await writeAuditLog(deps.db, {
        actorUserId: req.userId,
        actorType: "user",
        action: "tenant.approve",
        targetType: "tenant",
        targetId: tenant.id,
        tenantId: tenant.id,
      });

      res.status(200).json({ id: tenant.id, status: tenant.status });
    }),
  );

  router.post(
    "/:id/reject",
    requireAuth(deps),
    requireAdminPermission(deps, PERMISSION_KEYS.TENANT_APPROVE),
    validateBody(rejectOrSuspendTenantRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.userId) throw new UnauthorizedError("authentication required");
      const id = requireParam(req.params, "id");
      const { reason } = req.body as RejectOrSuspendTenantRequestInput;

      const tenant = await adminRejectTenant(deps.db, id);
      if (!tenant) {
        const existing = await adminGetTenantById(deps.db, id);
        if (!existing) throw new NotFoundError("tenant not found");
        throw new ConflictError("tenant is not pending approval");
      }

      await writeAuditLog(deps.db, {
        actorUserId: req.userId,
        actorType: "user",
        action: "tenant.reject",
        targetType: "tenant",
        targetId: tenant.id,
        tenantId: tenant.id,
        metadata: reason ? { reason } : {},
      });

      res.status(200).json({ id: tenant.id, status: tenant.status });
    }),
  );

  router.post(
    "/:id/suspend",
    requireAuth(deps),
    requireAdminPermission(deps, PERMISSION_KEYS.TENANT_SUSPEND),
    validateBody(rejectOrSuspendTenantRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.userId) throw new UnauthorizedError("authentication required");
      const id = requireParam(req.params, "id");
      const { reason } = req.body as RejectOrSuspendTenantRequestInput;

      const tenant = await adminSuspendTenant(deps.db, id);
      if (!tenant) {
        const existing = await adminGetTenantById(deps.db, id);
        if (!existing) throw new NotFoundError("tenant not found");
        throw new ConflictError("tenant is not active");
      }

      await writeAuditLog(deps.db, {
        actorUserId: req.userId,
        actorType: "user",
        action: "tenant.suspend",
        targetType: "tenant",
        targetId: tenant.id,
        tenantId: tenant.id,
        metadata: reason ? { reason } : {},
      });

      res.status(200).json({ id: tenant.id, status: tenant.status });
    }),
  );

  return router;
}
