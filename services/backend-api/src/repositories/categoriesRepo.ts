import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { categories } from "../db/schema.js";
import type { TenantScope } from "./tenantScope.js";

export type CategoryRow = typeof categories.$inferSelect;

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description?: string | undefined;
}

export interface UpdateCategoryInput {
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | null | undefined;
}

/** Tenant-owned. Every method is scoped to `scope.tenantId` - see tenantScope.ts. */
export function createCategoriesRepo(db: Database, scope: TenantScope) {
  return {
    async list(): Promise<CategoryRow[]> {
      return db.select().from(categories).where(eq(categories.tenantId, scope.tenantId));
    },

    async findById(id: string): Promise<CategoryRow | null> {
      const [row] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.tenantId, scope.tenantId)))
        .limit(1);
      return row ?? null;
    },

    async create(input: CreateCategoryInput): Promise<CategoryRow> {
      const [row] = await db
        .insert(categories)
        .values({ tenantId: scope.tenantId, name: input.name, slug: input.slug, description: input.description ?? null })
        .returning();
      if (!row) throw new Error("failed to create category");
      return row;
    },

    async update(id: string, input: UpdateCategoryInput): Promise<CategoryRow | null> {
      const [row] = await db
        .update(categories)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(categories.id, id), eq(categories.tenantId, scope.tenantId)))
        .returning();
      return row ?? null;
    },

    /** Hard delete - protected by the FK on products.category_id (route layer maps the FK violation to 409). */
    async remove(id: string): Promise<boolean> {
      const result = await db
        .delete(categories)
        .where(and(eq(categories.id, id), eq(categories.tenantId, scope.tenantId)))
        .returning({ id: categories.id });
      return result.length > 0;
    },
  };
}

export type CategoriesRepo = ReturnType<typeof createCategoriesRepo>;
