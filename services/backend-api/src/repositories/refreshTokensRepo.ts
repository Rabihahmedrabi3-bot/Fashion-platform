import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { refreshTokens } from "../db/schema.js";

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;

/** Refresh tokens are stored only as a deterministic hash (see lib/tokens.ts); never the raw value. */
export function createRefreshTokensRepo(db: Database) {
  return {
    async create(userId: string, tokenHash: string, expiresAt: Date): Promise<RefreshTokenRow> {
      const [row] = await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt }).returning();
      if (!row) throw new Error("failed to create refresh token");
      return row;
    },

    async findActiveByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
        .limit(1);
      return row ?? null;
    },

    async revoke(id: string): Promise<void> {
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, id));
    },

    async revokeAllForUser(userId: string): Promise<void> {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    },
  };
}

export type RefreshTokensRepo = ReturnType<typeof createRefreshTokensRepo>;
