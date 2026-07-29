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
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "fulfilled",
  "delivered",
  "cancelled",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["cod"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "collected", "failed"]);

/** Platform-owned: authentication identity, not tenant-scoped. */
export const users = pgTable(
  "users",
  {
    id: id(),
    email: varchar("email", { length: 320 }).notNull(),
    /** Optional alternate login identifier alongside email - unverified, unlike email. */
    phone: varchar("phone", { length: 30 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    status: userStatusEnum("status").notNull().default("pending_verification"),
    /** Bumped on password change/reset; access tokens carrying a stale value are rejected. */
    tokenVersion: integer("token_version").notNull().default(0),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_phone_unique").on(table.phone),
  ],
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

/**
 * Platform-owned singleton - always exactly one row, seeded once in
 * db/seed.ts and never inserted again. Enforced purely by convention (no
 * unique-row constraint beyond "the seed script only ever runs once per
 * environment"), so repo reads/writes never filter by id - they operate on
 * whichever single row exists.
 */
export const platformSettings = pgTable("platform_settings", {
  id: id(),
  tenantRegistrationOpen: boolean("tenant_registration_open").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
    brandingSecondaryColor: varchar("branding_secondary_color", { length: 7 }),
    whatsappNumber: varchar("whatsapp_number", { length: 20 }),
    brandingThemeConfig: jsonb("branding_theme_config").notNull().default({}),
    marketplaceEligible: boolean("marketplace_eligible").notNull().default(false),
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

/**
 * Tenant-owned. A customer account is store-specific (unique per
 * tenant_id+email), not a platform-wide identity like `users` - the same
 * email can hold separate customer records at two different stores.
 * `passwordHash` is nullable: a row created by a guest checkout has no
 * password until (and unless) that email later registers, at which point
 * the existing row is adopted rather than duplicated (see checkout route).
 */
export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    /** Bumped on password change; mirrors users.tokenVersion. */
    tokenVersion: integer("token_version").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customers_tenant_email_unique").on(table.tenantId, table.email),
    index("customers_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Tenant-owned. Contact/shipping fields are snapshotted here (not joined
 * live from `customers`) so a later profile edit never rewrites what a past
 * order actually shipped to. Single-store orders only in this increment -
 * schema intentionally leaves room for a future ParentOrder/StoreSubOrder
 * split (docs/architecture-blueprint.md §4) without a breaking migration,
 * since today's Order already maps 1:1 to "one store's sub-order".
 */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: orderStatusEnum("status").notNull().default("pending"),
    subtotalCents: integer("subtotal_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    customerName: varchar("customer_name", { length: 200 }).notNull(),
    customerEmail: varchar("customer_email", { length: 320 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 30 }).notNull(),
    shippingAddressLine1: varchar("shipping_address_line1", { length: 300 }).notNull(),
    shippingAddressLine2: varchar("shipping_address_line2", { length: 300 }),
    shippingCity: varchar("shipping_city", { length: 150 }).notNull(),
    shippingRegion: varchar("shipping_region", { length: 150 }),
    shippingPostalCode: varchar("shipping_postal_code", { length: 20 }),
    shippingCountry: varchar("shipping_country", { length: 100 }).notNull(),
    customerNote: varchar("customer_note", { length: 1000 }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("orders_tenant_status_idx").on(table.tenantId, table.status),
    index("orders_tenant_customer_idx").on(table.tenantId, table.customerId),
  ],
);

/**
 * Tenant-owned. Snapshotted at order time (name/sku/size/color/price) - not
 * a live join to products/variants, which can change or be archived later.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    productNameSnapshot: varchar("product_name_snapshot", { length: 200 }).notNull(),
    variantSkuSnapshot: varchar("variant_sku_snapshot", { length: 100 }).notNull(),
    variantSizeSnapshot: varchar("variant_size_snapshot", { length: 50 }),
    variantColorSnapshot: varchar("variant_color_snapshot", { length: 50 }),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

/**
 * Tenant-owned. Deliberately its own table, not columns on `orders` -
 * payment/payout stays separate from the core order domain (MASTER
 * DIRECTIVE rule) so fulfillment status and payment-collected status
 * transition independently, and a future real gateway integration is
 * additive rather than a breaking change to the order model. 1:1 with
 * orders for now (COD only); the unique index is what encodes that,
 * not the shape of the table itself.
 */
export const orderPayments = pgTable(
  "order_payments",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    method: paymentMethodEnum("method").notNull().default("cod"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("order_payments_order_unique").on(table.orderId)],
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

/**
 * Mirrors `refresh_tokens` exactly but scoped to `customers` - kept as its
 * own table rather than making `refresh_tokens.userId` nullable/polymorphic,
 * since customer auth is deliberately a separate system from staff auth
 * (separate secret too - see appDependencies.jwtCustomerAccessSecret).
 */
export const customerRefreshTokens = pgTable(
  "customer_refresh_tokens",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_refresh_tokens_customer_idx").on(table.customerId),
    uniqueIndex("customer_refresh_tokens_token_hash_unique").on(table.tokenHash),
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

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
  payment: one(orderPayments, { fields: [orders.id], references: [orderPayments.orderId] }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  variant: one(productVariants, { fields: [orderItems.variantId], references: [productVariants.id] }),
}));

export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
  order: one(orders, { fields: [orderPayments.orderId], references: [orders.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));
