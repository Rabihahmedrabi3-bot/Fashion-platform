import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import type { AppDependencies } from "../../src/appDependencies.js";
import { createServer } from "../../src/server.js";
import { getTestDb } from "./db.js";
import { TestEmailProvider } from "./testEmailProvider.js";

export interface TestContext {
  app: Express;
  deps: AppDependencies;
  emailProvider: TestEmailProvider;
}

// Separate from dev's uploads/ dir so test runs never mix with real local dev data.
const TEST_UPLOADS_DIR = path.join(os.tmpdir(), "fashion-platform-test-uploads");

export function buildTestApp(): TestContext {
  const emailProvider = new TestEmailProvider();
  const deps: AppDependencies = {
    db: getTestDb(),
    emailProvider,
    jwtAccessSecret: "test-access-secret-not-for-production-use-only",
    refreshTokenHashPepper: "test-refresh-pepper-not-for-production-use-only",
    emailFromAddress: "no-reply@test.local",
    publicApiBaseUrl: "http://localhost:4000",
    uploadsDir: TEST_UPLOADS_DIR,
  };
  return { app: createServer(deps), deps, emailProvider };
}
