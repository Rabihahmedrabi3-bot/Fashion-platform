import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { users } from "../db/schema.js";

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/** Platform-owned table - no tenant scoping applies to user identity records. */
export function createUsersRepo(db: Database) {
  return {
    async findByEmail(email: string): Promise<UserRow | null> {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ?? null;
    },

    async findByPhone(phone: string): Promise<UserRow | null> {
      const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
      return row ?? null;
    },

    async findById(id: string): Promise<UserRow | null> {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ?? null;
    },

    async create(
      input: Pick<NewUserRow, "email" | "passwordHash" | "fullName"> & { phone?: string | null },
    ): Promise<UserRow> {
      const [row] = await db.insert(users).values(input).returning();
      if (!row) throw new Error("failed to create user");
      return row;
    },

    async markEmailVerified(id: string): Promise<void> {
      await db
        .update(users)
        .set({ status: "active", emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, id));
    },

    async updatePassword(id: string, passwordHash: string): Promise<void> {
      await db
        .update(users)
        .set({
          passwordHash,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
    },
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
