import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client.js";

/** Runs pending migrations against the given connection string. Used by the dev CLI and by tests. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, pool } = createDatabase(connectionString);
  try {
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
  } finally {
    await pool.end();
  }
}
