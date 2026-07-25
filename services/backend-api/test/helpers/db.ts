import { sql } from "drizzle-orm";
import { createDatabase, type Database, type DatabaseHandle } from "../../src/db/client.js";

let handle: DatabaseHandle | null = null;

export function getTestDb(): Database {
  if (!handle) {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL must be set (see .env.example)");
    handle = createDatabase(url);
  }
  return handle.db;
}

/**
 * Reference data (roles/permissions/role_permissions) is seeded once in
 * globalSetup and left alone. Plain DELETEs in dependency order, not
 * TRUNCATE ... CASCADE: roles.tenant_id is a (nullable) FK to tenants, so a
 * cascading truncate of `tenants` would also wipe the seeded system roles.
 */
export async function truncateMutableTables(db: Database): Promise<void> {
  await db.execute(sql`DELETE FROM audit_logs`);
  await db.execute(sql`DELETE FROM refresh_tokens`);
  await db.execute(sql`DELETE FROM verification_tokens`);
  await db.execute(sql`DELETE FROM platform_admins`);
  await db.execute(sql`DELETE FROM tenant_memberships`);
  await db.execute(sql`DELETE FROM product_collections`);
  await db.execute(sql`DELETE FROM inventory`);
  await db.execute(sql`DELETE FROM product_variants`);
  await db.execute(sql`DELETE FROM products`);
  await db.execute(sql`DELETE FROM categories`);
  await db.execute(sql`DELETE FROM collections`);
  await db.execute(sql`DELETE FROM stores`);
  await db.execute(sql`DELETE FROM tenants`);
  await db.execute(sql`DELETE FROM users`);
}

export async function closeTestDb(): Promise<void> {
  if (handle) {
    await handle.pool.end();
    handle = null;
  }
}
