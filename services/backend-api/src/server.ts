import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import type { AppDependencies } from "./appDependencies.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createAdminAuditLogsRouter } from "./routes/admin/auditLogs.js";
import { createAdminTenantsRouter } from "./routes/admin/tenants.js";
import { createAuthRouter } from "./routes/auth.js";
import { createCategoriesRouter } from "./routes/categories.js";
import { createCollectionsRouter } from "./routes/collections.js";
import { createMembershipsRouter } from "./routes/memberships.js";
import { createProductsRouter } from "./routes/products.js";
import { createPermissionsRouter, createRolesRouter } from "./routes/rolesPermissions.js";
import { createPublicStoreRouter } from "./routes/publicStore.js";
import { createTenantsRouter } from "./routes/tenants.js";
import { createUsersRouter } from "./routes/users.js";

export function createServer(deps: AppDependencies): Express {
  const app = express();

  // Rate limit on auth endpoints only - brute-force/credential-stuffing surface, not the whole API.
  // Scoped per server instance (not a module-level singleton) so each app has its own counter.
  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(
    cors({
      origin: process.env.CORS_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [],
    }),
  );
  app.use(express.json());

  // Static assets only - nothing here ever executes upload content server-side.
  app.use("/uploads", express.static(deps.uploadsDir));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/auth", authRateLimiter, createAuthRouter(deps));
  app.use("/users", createUsersRouter(deps));
  app.use("/tenants", createTenantsRouter(deps));
  app.use("/tenants", createMembershipsRouter(deps));
  app.use("/tenants", createCategoriesRouter(deps));
  app.use("/tenants", createCollectionsRouter(deps));
  app.use("/tenants", createProductsRouter(deps));
  app.use("/roles", createRolesRouter(deps));
  app.use("/permissions", createPermissionsRouter(deps));
  app.use("/public/stores", createPublicStoreRouter(deps));
  app.use("/admin/tenants", createAdminTenantsRouter(deps));
  app.use("/admin/audit-logs", createAdminAuditLogsRouter(deps));

  app.use(errorHandler);

  return app;
}
