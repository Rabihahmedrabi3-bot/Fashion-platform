import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { customerRefreshTokens } from "../db/schema.js";

export type CustomerRefreshTokenRow = typeof customerRefreshTokens.$inferSelect;

/** Mirrors refreshTokensRepo.ts exactly, scoped to customers - see schema.ts for why this is a separate table. */
export function createCustomerRefreshTokensRepo(db: Database) {
  return {
    async create(customerId: string, tokenHash: string, expiresAt: Date): Promise<CustomerRefreshTokenRow> {
      const [row] = await db
        .insert(customerRefreshTokens)
        .values({ customerId, tokenHash, expiresAt })
        .returning();
      if (!row) throw new Error("failed to create customer refresh token");
      return row;
    },

    async findActiveByHash(tokenHash: string): Promise<CustomerRefreshTokenRow | null> {
      const [row] = await db
        .select()
        .from(customerRefreshTokens)
        .where(and(eq(customerRefreshTokens.tokenHash, tokenHash), isNull(customerRefreshTokens.revokedAt)))
        .limit(1);
      return row ?? null;
    },

    async revoke(id: string): Promise<void> {
      await db.update(customerRefreshTokens).set({ revokedAt: new Date() }).where(eq(customerRefreshTokens.id, id));
    },

    async revokeAllForCustomer(customerId: string): Promise<void> {
      await db
        .update(customerRefreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(customerRefreshTokens.customerId, customerId), isNull(customerRefreshTokens.revokedAt)));
    },
  };
}

export type CustomerRefreshTokensRepo = ReturnType<typeof createCustomerRefreshTokensRepo>;
