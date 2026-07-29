// @fashion-platform/shared-types
// Domain entity types, enums, and API DTOs shared between backend-api and
// future frontend consumers. Field names are camelCase; the API layer maps
// to/from the snake_case DB columns.

export type UserStatus = "pending_verification" | "active" | "suspended";
export type TenantStatus = "pending_approval" | "active" | "suspended" | "rejected";
export type TenantMembershipStatus = "invited" | "active" | "revoked";
export type StoreStatus = "draft" | "pending_approval" | "active" | "suspended";
export type VerificationTokenType = "email_verification" | "password_reset";
export type AuditActorType = "user" | "system";
export type ProductStatus = "draft" | "active" | "archived";
export type ProductVariantStatus = "active" | "archived";
export type OrderStatus = "pending" | "confirmed" | "fulfilled" | "delivered" | "cancelled";
export type PaymentMethod = "cod";
export type PaymentStatus = "pending" | "collected" | "failed";

export interface User {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantMembership {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
  status: TenantMembershipStatus;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  tenantId: string | null;
  key: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string;
}

/**
 * A fixed set of section types, not a freeform/orderable array - deliberately
 * NOT a website builder. The storefront renders these in a fixed order
 * (hero -> banner -> featuredCollection -> productGrid -> brandInfo),
 * skipping any optional section that's absent or disabled.
 */
export interface ThemeConfig {
  hero: {
    title: string;
    subtitle?: string | null | undefined;
    imageUrl?: string | null | undefined;
  };
  banner?:
    | {
        enabled: boolean;
        message?: string | null | undefined;
        linkUrl?: string | null | undefined;
      }
    | undefined;
  featuredCollection?:
    | {
        enabled: boolean;
        /** A slug, not an id - every public-facing reference in this app addresses catalog entities by slug. */
        collectionSlug?: string | null | undefined;
      }
    | undefined;
  productGrid?:
    | {
        enabled: boolean;
        title?: string | null | undefined;
        limit?: number | null | undefined;
      }
    | undefined;
  brandInfo?:
    | {
        enabled: boolean;
        heading?: string | null | undefined;
        body?: string | null | undefined;
      }
    | undefined;
}

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  hero: { title: "Welcome to our store" },
};

export interface Store {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: StoreStatus;
  brandingLogoUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingSecondaryColor: string | null;
  brandingThemeConfig: ThemeConfig;
  marketplaceEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Structured taxonomy fields live directly on the product (see domain-shared/../schema.ts rationale) - a 1:1 ProductAttribute table would add a join with no independent lifecycle. */
export interface Product {
  id: string;
  tenantId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  subcategory: string | null;
  gender: string | null;
  style: string | null;
  occasion: string | null;
  season: string | null;
  fit: string | null;
  material: string | null;
  brand: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Size and color are variant-level, not product-level - a product has multiple color/size variants. */
export interface ProductVariant {
  id: string;
  tenantId: string;
  productId: string;
  sku: string;
  size: string | null;
  color: string | null;
  priceCents: number;
  status: ProductVariantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Inventory {
  id: string;
  tenantId: string;
  variantId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariantWithInventory extends ProductVariant {
  quantity: number;
}

export interface ProductWithVariants extends Product {
  variants: ProductVariantWithInventory[];
  collectionIds: string[];
}

/** Returned by the products list endpoint - a variant count, not the full variant/inventory payload per row. */
export interface ProductListItem extends Product {
  variantCount: number;
}

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  actorType: AuditActorType;
  action: string;
  targetType: string;
  targetId: string;
  tenantId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Predefined system role keys. Custom tenant-defined roles are future work. */
export const SYSTEM_ROLE_KEYS = {
  SUPER_ADMIN: "super_admin",
  STORE_OWNER: "store_owner",
  STORE_MANAGER: "store_manager",
  CATALOG_MANAGER: "catalog_manager",
  ORDER_MANAGER: "order_manager",
  STAFF_BASIC: "staff_basic",
} as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS];

/** Permission keys exercised so far (Increments 1-2 scope of the authorization matrix). */
export const PERMISSION_KEYS = {
  STORE_READ: "store:read",
  STORE_UPDATE: "store:update",
  STAFF_READ: "staff:read",
  STAFF_CREATE: "staff:create",
  STAFF_UPDATE: "staff:update",
  STAFF_DELETE: "staff:delete",
  TENANT_READ: "tenant:read",
  TENANT_APPROVE: "tenant:approve",
  TENANT_SUSPEND: "tenant:suspend",
  AUDIT_READ: "audit:read",
  CATALOG_READ: "catalog:read",
  CATALOG_CREATE: "catalog:create",
  CATALOG_UPDATE: "catalog:update",
  CATALOG_DELETE: "catalog:delete",
  INVENTORY_READ: "inventory:read",
  INVENTORY_UPDATE: "inventory:update",
  ORDER_READ: "order:read",
  ORDER_UPDATE: "order:update",
  PLATFORM_SETTINGS_READ: "platform_settings:read",
  PLATFORM_SETTINGS_UPDATE: "platform_settings:update",
} as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

/** Resolved per-request context: who's calling, and within which tenant (if any). */
export interface TenantContext {
  userId: string;
  tenantId: string;
  membershipId: string;
  roleKey: string;
  permissions: PermissionKey[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface MeResponse {
  user: Pick<User, "id" | "email" | "fullName" | "status">;
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    roleKey: string;
    membershipStatus: TenantMembershipStatus;
  }>;
  /** Computed via resolveAdminContext - true iff this user holds a platform_admins row. */
  isPlatformAdmin: boolean;
}

export interface PublicStoreResponse {
  name: string;
  slug: string;
  brandingLogoUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingSecondaryColor: string | null;
  brandingThemeConfig: ThemeConfig;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
}

/** Products list on the storefront - a cheapest-active-variant price, not the full authenticated payload. */
export interface PublicProductSummary {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceCentsFrom: number | null;
}

export interface PublicProductDetail extends Product {
  variants: Array<Pick<ProductVariant, "id" | "sku" | "size" | "color" | "priceCents">>;
}

export interface MarketplaceProductSummary extends PublicProductSummary {
  storeSlug: string;
  storeName: string;
}

/** Tenant-owned. Never exposes passwordHash/tokenVersion over the API. */
export interface Customer {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Snapshotted at order time (name/sku/size/color/price), not a live join to
 * products/variants - a variant can be edited or archived after the fact
 * without altering what a past order says it contained.
 */
export interface OrderItem {
  id: string;
  orderId: string;
  tenantId: string;
  variantId: string;
  productNameSnapshot: string;
  variantSkuSnapshot: string;
  variantSizeSnapshot: string | null;
  variantColorSnapshot: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  createdAt: string;
}

/**
 * Contact/shipping fields are snapshotted onto the order (not joined live
 * from `customers`) so editing a customer profile later never rewrites what
 * a past order shipped to.
 */
export interface Order {
  id: string;
  tenantId: string;
  customerId: string;
  status: OrderStatus;
  subtotalCents: number;
  totalCents: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string | null;
  shippingCity: string;
  shippingRegion: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string;
  customerNote: string | null;
  cancelledAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Kept as its own entity/table (not columns on `orders`) so payment state
 * transitions independently of fulfillment state, and a future real gateway
 * can slot in without an order-model change.
 */
export interface OrderPayment {
  id: string;
  orderId: string;
  tenantId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  collectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderWithDetails extends Order {
  items: OrderItem[];
  payment: OrderPayment;
}

/** Returned by the orders list endpoint - an item count, not the full item/payment payload per row. */
export interface OrderListItem extends Order {
  itemCount: number;
}

export interface CheckoutItemInput {
  variantId: string;
  quantity: number;
}

export interface CheckoutRequest {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2?: string | null | undefined;
  shippingCity: string;
  shippingRegion?: string | null | undefined;
  shippingPostalCode?: string | null | undefined;
  shippingCountry: string;
  customerNote?: string | null | undefined;
  items: CheckoutItemInput[];
}

export interface CustomerRegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null | undefined;
}

export interface CustomerLoginRequest {
  email: string;
  password: string;
}

export interface CustomerMeResponse {
  customer: Pick<Customer, "id" | "email" | "fullName" | "phone">;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
}

export interface UpdateOrderPaymentRequest {
  status: Extract<PaymentStatus, "collected" | "failed">;
}

/** Singleton row - platform-wide, not tenant-scoped. */
export interface PlatformSettings {
  tenantRegistrationOpen: boolean;
  updatedAt: string;
}

export interface UpdatePlatformSettingsRequest {
  tenantRegistrationOpen: boolean;
}

export interface PlatformAnalytics {
  tenantsByStatus: Record<TenantStatus, number>;
  ordersByStatus: Record<OrderStatus, number>;
  totalOrders: number;
  totalRevenueCents: number;
  topProducts: Array<{
    productName: string;
    tenantId: string;
    tenantName: string;
    quantitySold: number;
    revenueCents: number;
  }>;
}

export interface TenantAnalytics {
  ordersByStatus: Record<OrderStatus, number>;
  totalOrders: number;
  totalRevenueCents: number;
  topProducts: Array<{
    productName: string;
    quantitySold: number;
    revenueCents: number;
  }>;
}
