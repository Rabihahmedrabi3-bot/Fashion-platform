import { Router } from "express";
import { listAuditLogsQuerySchema } from "@fashion-platform/validation";
import { PERMISSION_KEYS } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../../appDependencies.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdminPermission } from "../../middleware/requireAdminPermission.js";
import { adminListAuditLogs } from "../../repositories/auditLogsRepo.js";

export function createAdminAuditLogsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth(deps),
    requireAdminPermission(deps, PERMISSION_KEYS.AUDIT_READ),
    asyncHandler(async (req, res) => {
      const query = listAuditLogsQuerySchema.parse(req.query);
      const logs = await adminListAuditLogs(deps.db, {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.from ? { from: new Date(query.from) } : {}),
        ...(query.to ? { to: new Date(query.to) } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.offset !== undefined ? { offset: query.offset } : {}),
      });
      res.status(200).json(logs);
    }),
  );

  return router;
}
