import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { customers } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type CustomerRow = typeof customers.$inferSelect;

export interface UpsertGuestCustomerInput {
  email: string;
  fullName: string;
  phone?: string | null | undefined;
}

export interface RegisterCustomerInput {
  email: string;
  fullName: string;
  phone?: string | null | undefined;
  passwordHash: string;
}

/**
 * Tenant-owned - a customer account is store-specific, not a platform-wide
 * identity. Every method is scoped to `scope.tenantId` - see tenantScope.ts.
 */
export function createCustomersRepo(db: Database, scope: TenantScope) {
  async function findByEmail(email: string): Promise<CustomerRow | null> {
    const [row] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, scope.tenantId), eq(customers.email, email)))
      .limit(1);
    return row ?? null;
  }

  async function create(input: {
    email: string;
    fullName: string;
    phone?: string | null | undefined;
    passwordHash?: string | null | undefined;
  }): Promise<CustomerRow> {
    const [row] = await db
      .insert(customers)
      .values({
        tenantId: scope.tenantId,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone ?? null,
        passwordHash: input.passwordHash ?? null,
      })
      .returning();
    if (!row) throw new Error("failed to create customer");
    return row;
  }

  return {
    findByEmail,

    async findById(id: string): Promise<CustomerRow | null> {
      const [row] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, scope.tenantId)))
        .limit(1);
      return row ?? null;
    },

    create,

    /**
     * Checkout path: reuse an existing guest row (refreshing its contact
     * details), or create one. Never touches a row that already has a
     * password - a registered account's own profile is authoritative over
     * whatever name/phone happens to be typed at checkout.
     */
    async upsertGuest(input: UpsertGuestCustomerInput): Promise<CustomerRow> {
      const existing = await findByEmail(input.email);
      if (!existing) return create(input);
      if (existing.passwordHash) return existing;

      const [row] = await db
        .update(customers)
        .set({ fullName: input.fullName, phone: input.phone ?? null, updatedAt: new Date() })
        .where(eq(customers.id, existing.id))
        .returning();
      return row ?? existing;
    },

    /**
     * Register path: adopts an existing guest row (passwordHash IS NULL)
     * instead of creating a duplicate customer for the same email - a prior
     * guest order and a later account signup are the same person. Returns
     * null if the email already belongs to a password-holding account.
     */
    async registerOrAdopt(input: RegisterCustomerInput): Promise<CustomerRow | null> {
      const existing = await findByEmail(input.email);
      if (!existing) {
        return create({
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
          passwordHash: input.passwordHash,
        });
      }
      if (existing.passwordHash) return null;

      const [row] = await db
        .update(customers)
        .set({
          fullName: input.fullName,
          phone: input.phone ?? null,
          passwordHash: input.passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, existing.id))
        .returning();
      return row ?? null;
    },

    async updatePassword(id: string, passwordHash: string): Promise<void> {
      await db
        .update(customers)
        .set({
          passwordHash,
          tokenVersion: sql`${customers.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(customers.id, id), eq(customers.tenantId, scope.tenantId)));
    },
  };
}

export type CustomersRepo = ReturnType<typeof createCustomersRepo>;
