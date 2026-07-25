import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { collections, productCollections } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type CollectionRow = typeof collections.$inferSelect;

export interface CreateCollectionInput {
  name: string;
  slug: string;
  description?: string | undefined;
}

export interface UpdateCollectionInput {
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | null | undefined;
}

/** Tenant-owned. Every method is scoped to `scope.tenantId` - see tenantScope.ts. */
export function createCollectionsRepo(db: Database, scope: TenantScope) {
  return {
    async list(): Promise<CollectionRow[]> {
      return db.select().from(collections).where(eq(collections.tenantId, scope.tenantId));
    },

    async findById(id: string): Promise<CollectionRow | null> {
      const [row] = await db
        .select()
        .from(collections)
        .where(and(eq(collections.id, id), eq(collections.tenantId, scope.tenantId)))
        .limit(1);
      return row ?? null;
    },

    async create(input: CreateCollectionInput): Promise<CollectionRow> {
      const [row] = await db
        .insert(collections)
        .values({
          tenantId: scope.tenantId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
        })
        .returning();
      if (!row) throw new Error("failed to create collection");
      return row;
    },

    async update(id: string, input: UpdateCollectionInput): Promise<CollectionRow | null> {
      const [row] = await db
        .update(collections)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(collections.id, id), eq(collections.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },

    /** Nothing structurally depends on a collection existing beyond the junction table, so clear that first. */
    async remove(id: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        await tx.delete(productCollections).where(eq(productCollections.collectionId, id));
        const result = await tx
          .delete(collections)
          .where(and(eq(collections.id, id), eq(collections.tenantId, scope.tenantId)))
          .returning({ id: collections.id });
        return result.length > 0;
      });
    },
  };
}

export type CollectionsRepo = ReturnType<typeof createCollectionsRepo>;
