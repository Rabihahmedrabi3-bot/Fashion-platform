import type { TenantContext } from "@fashion-platform/shared-types";
import type { AdminContext } from "../repositories/adminScopedRepo.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by middleware/auth.ts once the access token is verified. */
      userId?: string;
      /** Set by middleware/tenantContext.ts once tenant membership is resolved for the route's :id. */
      tenantContext?: TenantContext;
      /** Set by middleware/requireAdminPermission.ts once platform-admin authority is resolved. */
      adminContext?: AdminContext;
    }
  }
}

export {};
