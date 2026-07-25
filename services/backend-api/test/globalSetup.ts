import "./helpers/loadEnv.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";

/** Runs once before the whole test run: migrates the test DB and seeds static reference data (roles/permissions). */
export default async function setup(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL must be set to run tests (see .env.example)");
  }

  await runMigrations(testDatabaseUrl);
  await seed(testDatabaseUrl);
}
