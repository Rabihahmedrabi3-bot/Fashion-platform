import { Router } from "express";
import {
  inviteMembershipRequestSchema,
  updateMembershipRequestSchema,
  type InviteMembershipRequestInput,
  type UpdateMembershipRequestInput,
} from "@fashion-platform/validation";
import { PERMISSION_KEYS, type SystemRoleKey } from "@fashion-platform/shared-types";
import { canAssignRole } from "@fashion-platform/domain-shared";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { requireParam } from "../lib/params.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { createMembershipsRepo } from "../repositories/membershipsRepo.js";
import { createRolesRepo } from "../repositories/rolesRepo.js";
import { createUsersRepo } from "../repositories/usersRepo.js";

export function createMembershipsRouter(deps: AppDependencies): Router {
  const router = Router();
  const rolesRepo = createRolesRepo(deps.db);
  const usersRepo = createUsersRepo(deps.db);

  router.get(
    "/:id/memberships",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.STAFF_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const membershipsRepo = createMembershipsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const memberships = await membershipsRepo.list();
      res.status(200).json(
        memberships.map((membership) => ({
          id: membership.id,
          userId: membership.userId,
          userEmail: membership.userEmail,
          userFullName: membership.userFullName,
          roleKey: membership.roleKey,
          status: membership.status,
        })),
      );
    }),
  );

  router.post(
    "/:id/memberships",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.STAFF_CREATE),
    validateBody(inviteMembershipRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext || !req.userId) throw new UnauthorizedError("tenant context not resolved");
      const { email, roleKey } = req.body as InviteMembershipRequestInput;

      const targetRole = await rolesRepo.findSystemRoleByKey(roleKey);
      if (!targetRole) throw new NotFoundError(`unknown role: ${roleKey}`);

      if (!canAssignRole(req.tenantContext.roleKey as SystemRoleKey, roleKey as SystemRoleKey)) {
        throw new ForbiddenError("your role cannot assign this role");
      }

      const invitedUser = await usersRepo.findByEmail(email);
      if (!invitedUser) {
        throw new NotFoundError("no account exists with this email - the user must register first");
      }

      const membershipsRepo = createMembershipsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const membership = await membershipsRepo.create({
        userId: invitedUser.id,
        roleId: targetRole.id,
        invitedBy: req.userId,
      });
      res.status(201).json({ id: membership.id, status: membership.status, roleKey });
    }),
  );

  router.patch(
    "/:id/memberships/:membershipId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.STAFF_UPDATE),
    validateBody(updateMembershipRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const { roleKey, status } = req.body as UpdateMembershipRequestInput;
      const membershipsRepo = createMembershipsRepo(deps.db, { tenantId: req.tenantContext.tenantId });

      const membershipId = requireParam(req.params, "membershipId");
      const existing = await membershipsRepo.findById(membershipId);
      if (!existing) throw new NotFoundError("membership not found");

      let roleId: string | undefined;
      if (roleKey) {
        if (!canAssignRole(req.tenantContext.roleKey as SystemRoleKey, roleKey as SystemRoleKey)) {
          throw new ForbiddenError("your role cannot assign this role");
        }
        const targetRole = await rolesRepo.findSystemRoleByKey(roleKey);
        if (!targetRole) throw new NotFoundError(`unknown role: ${roleKey}`);
        roleId = targetRole.id;
      }

      const updated = await membershipsRepo.updateRoleOrStatus(membershipId, {
        ...(roleId ? { roleId } : {}),
        ...(status ? { status } : {}),
      });
      if (!updated) throw new NotFoundError("membership not found");
      res.status(200).json({ id: updated.id, status: updated.status });
    }),
  );

  router.delete(
    "/:id/memberships/:membershipId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.STAFF_DELETE),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const membershipsRepo = createMembershipsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const membershipId = requireParam(req.params, "membershipId");
      const updated = await membershipsRepo.updateRoleOrStatus(membershipId, { status: "revoked" });
      if (!updated) throw new NotFoundError("membership not found");
      res.status(204).send();
    }),
  );

  return router;
}
