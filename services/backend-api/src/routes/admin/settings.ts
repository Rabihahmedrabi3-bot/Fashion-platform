import { Router } from "express";
import { updatePlatformSettingsRequestSchema, type UpdatePlatformSettingsRequestInput } from "@fashion-platform/validation";
import { PERMISSION_KEYS } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../../appDependencies.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { UnauthorizedError } from "../../lib/errors.js";
import { validateBody } from "../../lib/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdminPermission } from "../../middleware/requireAdminPermission.js";
import { createPlatformSettingsRepo } from "../../repositories/platformSettingsRepo.js";
import { writeAuditLog } from "../../repositories/auditLogsRepo.js";

export function createAdminSettingsRouter(deps: AppDependencies): Router {
  const router = Router();
  const settingsRepo = createPlatformSettingsRepo(deps.db);

  router.get(
    "/",
    requireAuth(deps),
    requireAdminPermission(deps, PERMISSION_KEYS.PLATFORM_SETTINGS_READ),
    asyncHandler(async (_req, res) => {
      res.status(200).json(await settingsRepo.get());
    }),
  );

  router.patch(
    "/",
    requireAuth(deps),
    requireAdminPermission(deps, PERMISSION_KEYS.PLATFORM_SETTINGS_UPDATE),
    validateBody(updatePlatformSettingsRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.userId) throw new UnauthorizedError("authentication required");
      const input = req.body as UpdatePlatformSettingsRequestInput;

      const settings = await settingsRepo.update(input);

      await writeAuditLog(deps.db, {
        actorUserId: req.userId,
        actorType: "user",
        action: "platform_settings.update",
        targetType: "platform_settings",
        targetId: settings.id,
        tenantId: null,
        metadata: { tenantRegistrationOpen: input.tenantRegistrationOpen },
      });

      res.status(200).json(settings);
    }),
  );

  return router;
}
