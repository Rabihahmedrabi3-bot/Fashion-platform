import express, { type Express } from "express";

/**
 * Creates the Express application instance.
 *
 * Deliberately minimal for Milestone 0 / Step 1: this only proves the
 * tooling foundation (TypeScript, build, test, lint) works end to end.
 * No auth, tenant, or database logic belongs here yet.
 */
export function createServer(): Express {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
