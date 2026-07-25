import { afterAll, beforeEach } from "vitest";
import { closeTestDb, getTestDb, truncateMutableTables } from "./db.js";

beforeEach(async () => {
  await truncateMutableTables(getTestDb());
});

afterAll(async () => {
  await closeTestDb();
});
