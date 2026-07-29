import type { Express } from "express";
import type { AppDependencies } from "../../src/appDependencies.js";
import { createServer } from "../../src/server.js";
import { getTestDb } from "./db.js";
import { TestEmailProvider } from "./testEmailProvider.js";
import { TestImageStorage } from "./testImageStorage.js";
import { TestIntentParser } from "./testIntentParser.js";
import { TestResultRanker } from "./testResultRanker.js";

export interface TestContext {
  app: Express;
  deps: AppDependencies;
  emailProvider: TestEmailProvider;
  imageStorage: TestImageStorage;
  intentParser: TestIntentParser;
  resultRanker: TestResultRanker;
}

export function buildTestApp(): TestContext {
  const emailProvider = new TestEmailProvider();
  const imageStorage = new TestImageStorage();
  const intentParser = new TestIntentParser();
  const resultRanker = new TestResultRanker();
  const deps: AppDependencies = {
    db: getTestDb(),
    emailProvider,
    jwtAccessSecret: "test-access-secret-not-for-production-use-only",
    jwtCustomerAccessSecret: "test-customer-access-secret-not-for-production-use-only",
    refreshTokenHashPepper: "test-refresh-pepper-not-for-production-use-only",
    emailFromAddress: "no-reply@test.local",
    imageStorage,
    intentParser,
    resultRanker,
  };
  return { app: createServer(deps), deps, emailProvider, imageStorage, intentParser, resultRanker };
}
