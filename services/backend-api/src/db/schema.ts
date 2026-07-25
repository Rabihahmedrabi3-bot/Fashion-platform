import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const userStatusEnum = pgEnum("user_status", ["pending_verification", "active", "suspended"]);
export const tenantStatusEnum = pgEnum("tenant_status", [
  "pending_approval",
  "active",
  "suspended",
  "rejected",
]);
export const membershipStatusEnum = pgEnum("membership_status", ["invited", "active", "revoked"]);
export const storeStatusEnum = pgEnum("store_status", [
  "draft",
  "pending_approval",
  "active",
  "suspended",
]);
export const productStatusEnum = pgEnum("product_status", ["draft", "active", "archived"]);
export const productVariantStatusEnum = pgEnum("product_variant_status", ["active", "archived"]);
export const auditActorTypeEnum = pgEnum("audit_actor_type", ["user", "system"]);
export const verificationTokenTypeEnum = pgEnum("verification_token_type", [
  "email_verification",
  "password_reset",
]);

/** Platform-owned: authentication identity, not tenant-scoped. */
export const users = pgTable(
  "users",
  {
    id: id(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    status: userStatusEnum("status").notNull().default("pending_verification"),
    /** Bumped on password change/reset; access tokens carrying a stale value are rejected. */
    tokenVersion: integer("token_version").notNull().default(0),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

/** Tenant-owned (identified by its own id). */
export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 63 }).notNull(),
    status: tenantStatusEnum("status").notNull().default("pending_approval"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tenants_slug_unique").on(table.slug),
    index("tenants_status_idx").on(table.status),
  ],
);

/**
 * Platform-owned: predefined system roles have tenant_id = NULL and are
 * seeded once, shared across all tenants (the tenant scoping for a system
 * role assignment lives on tenant_memberships.tenant_id, not here). Future
 * tenant-custom roles would set tenant_id and is_system = false.
 */
export const roles = pgTable(
  "roles",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    key: varchar("key", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    isSystem: boolean("is_system").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("roles_tenant_key_unique").on(
      sql`COALESCE(${table.tenantId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.key,
    ),
  ],
);

/** Platform-owned reference data. */
export const permissions = pgTable(
  "permissions",
  {
    id: id(),
    key: varchar("key", { length: 100 }).notNull(),
    resource: varchar("resource", { length: 100 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    description: varchar("description", { length: 500 }).notNull(),
  },
  (table) => [uniqueIndex("permissions_key_unique").on(table.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

/**
 * A user may hold platform-level authority (currently only super_admin) via
 * this table - deliberately separate from tenant_memberships, which always
 * requires a tenant. This fills a gap in the source spec: it describes
 * super_admin as a "platform/system role" with roles.tenant_id = NULL, but
 * tenant_memberships.tenant_id is NOT NULL, so a platform-only role cannot
 * be assigned through a tenant membership row.
 */
export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Tenant-owned. Unique (tenant_id, user_id): one membership per user per tenant. */
export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    status: membershipStatusEnum("status").notNull().default("invited"),
    invitedBy: uuid("invited_by").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tenant_memberships_tenant_user_unique").on(table.tenantId, table.userId),
    index("tenant_memberships_user_idx").on(table.userId),
    index("tenant_memberships_tenant_idx").on(table.tenantId),
  ],
);

/** Tenant-owned. One store per tenant in Increment 1 (1:1). */
export const stores = pgTable(
  "stores",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 63 }).notNull(),
    status: storeStatusEnum("status").notNull().default("draft"),
    brandingLogoUrl: varchar("branding_logo_url", { length: 2048 }),
    brandingPrimaryColor: varchar("branding_primary_color", { length: 7 }),
    brandingThemeConfig: jsonb("branding_theme_config").notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stores_tenant_unique").on(table.tenantId),
    uniqueIndex("stores_slug_unique").on(table.slug),
    index("stores_status_idx").on(table.status),
  ],
);

/** Tenant-owned. */
export const categories = pgTable(
  "categories",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 63 }).notNull(),
    description: varchar("description", { length: 2000 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("categories_tenant_slug_unique").on(table.tenantId, table.slug),
    index("categories_tenant_idx").on(table.tenantId),
  ],
);

/** Tenant-owned. */
export const collections = pgTable(
  "collections",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 63 }).notNull(),
    description: varchar("description", { length: 2000 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("collections_tenant_slug_unique").on(table.tenantId, table.slug),
    index("collections_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Tenant-owned. Structured taxonomy fields (subcategory..brand) live
 * directly on the row rather than a separate ProductAttribute table - a 1:1
 * relation with no independent lifecycle doesn't need its own table. They
 * are plain nullable varchars, not pg enums, since the fashion taxonomy is
 * expected to evolve and enum-altering migrations are painful at scale.
 * Size/color are deliberately NOT here - see product_variants.
 */
export const products = pgTable(
  "products",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    categoryId: uuid("category_id").references(() => categories.id),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 63 }).notNull(),
    description: varchar("description", { length: 5000 }),
    status: productStatusEnum("status").notNull().default("draft"),
    subcategory: varchar("subcategory", { length: 100 }),
    gender: varchar("gender", { length: 50 }),
    style: varchar("style", { length: 100 }),
    occasion: varchar("occasion", { length: 100 }),
    season: varchar("season", { length: 50 }),
    fit: varchar("fit", { length: 50 }),
    material: varchar("material", { length: 100 }),
    brand: varchar("brand", { length: 100 }),
    imageUrl: varchar("image_url", { length: 2048 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_tenant_slug_unique").on(table.tenantId, table.slug),
    index("products_tenant_idx").on(table.tenantId),
    index("products_category_idx").on(table.categoryId),
    index("products_status_idx").on(table.status),
  ],
);

/** Tenant-owned. Size and color are variant-defining dimensions, not product-level attributes. */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    sku: varchar("sku", { length: 100 }).notNull(),
    size: varchar("size", { length: 50 }),
    color: varchar("color", { length: 50 }),
    priceCents: integer("price_cents").notNull(),
    status: productVariantStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_variants_tenant_sku_unique").on(table.tenantId, table.sku),
    index("product_variants_product_idx").on(table.productId),
    index("product_variants_tenant_idx").on(table.tenantId),
  ],
);

/** Tenant-owned. 1:1 with product_variants; a row is created alongside every variant. */
export const inventory = pgTable(
  "inventory",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    quantity: integer("quantity").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inventory_variant_unique").on(table.variantId),
    index("inventory_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Tenant-owned via both sides (product and collection are already
 * tenant-checked at write time), so this pure junction table doesn't carry
 * its own tenant_id.
 */
export const productCollections = pgTable(
  "product_collections",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.collectionId] }),
    index("product_collections_collection_idx").on(table.collectionId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    action: varchar("action", { length: 200 }).notNull(),
    targetType: varchar("target_type", { length: 100 }).notNull(),
    targetId: uuid("target_id").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_tenant_idx").on(table.tenantId),
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

/** Refresh tokens are opaque and stored only as a salted hash; never the raw value. */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("refresh_tokens_user_idx").on(table.userId),
    uniqueIndex("refresh_tokens_token_hash_unique").on(table.tokenHash),
  ],
);

/** Backs email-verification and password-reset flows; single-use, hashed at rest. */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    type: verificationTokenTypeEnum("type").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("verification_tokens_user_idx").on(table.userId),
    uniqueIndex("verification_tokens_token_hash_unique").on(table.tokenHash),
  ],
);

export const tenantMembershipsRelations = relations(tenantMemberships, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantMemberships.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [tenantMemberships.userId], references: [users.id] }),
  role: one(roles, { fields: [tenantMemberships.roleId], references: [roles.id] }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  variants: many(productVariants),
  productCollections: many(productCollections),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  inventory: one(inventory, { fields: [productVariants.id], references: [inventory.variantId] }),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  productCollections: many(productCollections),
}));

export const productCollectionsRelations = relations(productCollections, ({ one }) => ({
  product: one(products, { fields: [productCollections.productId], references: [products.id] }),
  collection: one(collections, {
    fields: [productCollections.collectionId],
    references: [collections.id],
  }),
}));
