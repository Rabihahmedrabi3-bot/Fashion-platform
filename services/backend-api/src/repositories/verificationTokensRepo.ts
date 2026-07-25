import { and, eq, isNull } from "drizzle-orm";
import type { VerificationTokenType } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { verificationTokens } from "../db/schema.js";

export type VerificationTokenRow = typeof verificationTokens.$inferSelect;

/** Email-verification / password-reset tokens: hashed at rest, single-use. */
export function createVerificationTokensRepo(db: Database) {
  return {
    async create(
      userId: string,
      tokenHash: string,
      type: VerificationTokenType,
      expiresAt: Date,
    ): Promise<VerificationTokenRow> {
      const [row] = await db
        .insert(verificationTokens)
        .values({ userId, tokenHash, type, expiresAt })
        .returning();
      if (!row) throw new Error("failed to create verification token");
      return row;
    },

    async findUnusedByHash(
      tokenHash: string,
      type: VerificationTokenType,
    ): Promise<VerificationTokenRow | null> {
      const [row] = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.tokenHash, tokenHash),
            eq(verificationTokens.type, type),
            isNull(verificationTokens.usedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async markUsed(id: string): Promise<void> {
      await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, id));
    },
  };
}

export type VerificationTokensRepo = ReturnType<typeof createVerificationTokensRepo>;
