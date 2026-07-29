import { and, eq } from "drizzle-orm";
import type { ThemeConfig } from "@fashion-platform/shared-types";
import type { Database } from "../db/client.js";
import { stores } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type StoreRow = typeof stores.$inferSelect;

export interface CreateStoreInput {
  tenantId: string;
  name: string;
  slug: string;
}

export interface UpdateStoreInput {
  name?: string | undefined;
  brandingLogoUrl?: string | null | undefined;
  brandingPrimaryColor?: string | null | undefined;
  brandingSecondaryColor?: string | null | undefined;
  brandingThemeConfig?: ThemeConfig | undefined;
  marketplaceEligible?: boolean | undefined;
  whatsappNumber?: string | null | undefined;
}

/** Tenant-owned. Every method is scoped to `scope.tenantId` - see tenantScope.ts. */
export function createStoresRepo(db: Database, scope: TenantScope) {
  return {
    async getOwn(): Promise<StoreRow | null> {
      const [row] = await db.select().from(stores).where(eq(stores.tenantId, scope.tenantId)).limit(1);
      return row ?? null;
    },

    async updateOwn(input: UpdateStoreInput): Promise<StoreRow | null> {
      const [row] = await db
        .update(stores)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.brandingLogoUrl !== undefined ? { brandingLogoUrl: input.brandingLogoUrl } : {}),
          ...(input.brandingPrimaryColor !== undefined
            ? { brandingPrimaryColor: input.brandingPrimaryColor }
            : {}),
          ...(input.brandingSecondaryColor !== undefined
            ? { brandingSecondaryColor: input.brandingSecondaryColor }
            : {}),
          ...(input.brandingThemeConfig !== undefined
            ? { brandingThemeConfig: input.brandingThemeConfig }
            : {}),
          ...(input.marketplaceEligible !== undefined
            ? { marketplaceEligible: input.marketplaceEligible }
            : {}),
          ...(input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber } : {}),
          updatedAt: new Date(),
        })
        .where(eq(stores.tenantId, scope.tenantId))
        .returning();
      return row ?? null;
    },
  };
}

export type StoresRepo = ReturnType<typeof createStoresRepo>;

/**
 * Store creation happens once, at tenant-creation time, before a
 * TenantScope can exist for the new tenant - so it lives outside the
 * scoped factory. Still the only place `stores` is inserted into.
 */
export async function insertStoreForNewTenant(db: Database, input: CreateStoreInput): Promise<StoreRow> {
  const [row] = await db
    .insert(stores)
    .values({ tenantId: input.tenantId, name: input.name, slug: input.slug, status: "pending_approval" })
    .returning();
  if (!row) throw new Error("failed to create store");
  return row;
}

export async function findPublicStoreBySlug(
  db: Database,
  slug: string,
): Promise<StoreRow | null> {
  const [row] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.slug, slug), eq(stores.status, "active")))
    .limit(1);
  return row ?? null;
}
