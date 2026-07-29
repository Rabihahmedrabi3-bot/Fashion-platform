// @fashion-platform/validation
// zod request-validation schemas for the Milestone-0 / Increment-1 API
// contract (docs/milestone-0-implementation-spec.md §8). Shared between
// backend-api's route validation and (later) api-client.

import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(8).max(200);
const uuidSchema = z.string().uuid();
const phoneSchema = z.string().trim().min(3).max(30);
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase alphanumeric with single hyphens");

// --- Auth ---

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(200),
});
export type RegisterRequestInput = z.infer<typeof registerRequestSchema>;

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailRequestInput = z.infer<typeof verifyEmailRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginRequestInput = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequestInput = z.infer<typeof refreshRequestSchema>;

export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutRequestInput = z.infer<typeof logoutRequestSchema>;

export const requestPasswordResetRequestSchema = z.object({
  email: emailSchema,
});
export type RequestPasswordResetRequestInput = z.infer<typeof requestPasswordResetRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>;

// --- Tenants ---

export const createTenantRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
});
export type CreateTenantRequestInput = z.infer<typeof createTenantRequestSchema>;

export const tenantIdParamSchema = z.object({
  id: uuidSchema,
});
export type TenantIdParamInput = z.infer<typeof tenantIdParamSchema>;

export const listTenantsQuerySchema = z.object({
  status: z.enum(["pending_approval", "active", "suspended", "rejected"]).optional(),
});
export type ListTenantsQueryInput = z.infer<typeof listTenantsQuerySchema>;

export const rejectOrSuspendTenantRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000).optional(),
});
export type RejectOrSuspendTenantRequestInput = z.infer<typeof rejectOrSuspendTenantRequestSchema>;

// --- Store ---

/**
 * A fixed set of section types, not a freeform/orderable array - deliberately
 * NOT a website builder. Mirrors @fashion-platform/shared-types' ThemeConfig.
 */
export const themeConfigSchema = z.object({
  hero: z.object({
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().max(500).nullable().optional(),
    imageUrl: z.string().trim().url().nullable().optional(),
  }),
  banner: z
    .object({
      enabled: z.boolean(),
      message: z.string().trim().max(300).nullable().optional(),
      linkUrl: z.string().trim().url().nullable().optional(),
    })
    .optional(),
  featuredCollection: z
    .object({
      enabled: z.boolean(),
      collectionSlug: slugSchema.nullable().optional(),
    })
    .optional(),
  productGrid: z
    .object({
      enabled: z.boolean(),
      title: z.string().trim().max(200).nullable().optional(),
      limit: z.number().int().min(1).max(50).nullable().optional(),
    })
    .optional(),
  brandInfo: z
    .object({
      enabled: z.boolean(),
      heading: z.string().trim().max(200).nullable().optional(),
      body: z.string().trim().max(2000).nullable().optional(),
    })
    .optional(),
});
export type ThemeConfigInput = z.infer<typeof themeConfigSchema>;

export const updateStoreRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    brandingLogoUrl: z.string().trim().url().nullable().optional(),
    brandingPrimaryColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    brandingSecondaryColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    brandingThemeConfig: themeConfigSchema.optional(),
    marketplaceEligible: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field must be provided");
export type UpdateStoreRequestInput = z.infer<typeof updateStoreRequestSchema>;

export const storeSlugParamSchema = z.object({
  slug: slugSchema,
});
export type StoreSlugParamInput = z.infer<typeof storeSlugParamSchema>;

// --- Public storefront ---

export const publicProductsQuerySchema = z.object({
  category: slugSchema.optional(),
  collection: slugSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type PublicProductsQueryInput = z.infer<typeof publicProductsQuerySchema>;

export const marketplaceProductsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type MarketplaceProductsQueryInput = z.infer<typeof marketplaceProductsQuerySchema>;

// --- Memberships ---

export const inviteMembershipRequestSchema = z.object({
  email: emailSchema,
  roleKey: z.string().trim().min(1),
});
export type InviteMembershipRequestInput = z.infer<typeof inviteMembershipRequestSchema>;

export const updateMembershipRequestSchema = z
  .object({
    roleKey: z.string().trim().min(1).optional(),
    status: z.enum(["active", "revoked"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field must be provided");
export type UpdateMembershipRequestInput = z.infer<typeof updateMembershipRequestSchema>;

export const membershipParamsSchema = z.object({
  id: uuidSchema,
  membershipId: uuidSchema,
});
export type MembershipParamsInput = z.infer<typeof membershipParamsSchema>;

// --- Categories ---

export const createCategoryRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional(),
});
export type CreateCategoryRequestInput = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field must be provided");
export type UpdateCategoryRequestInput = z.infer<typeof updateCategoryRequestSchema>;

// --- Collections ---

export const createCollectionRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional(),
});
export type CreateCollectionRequestInput = z.infer<typeof createCollectionRequestSchema>;

export const updateCollectionRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field must be provided");
export type UpdateCollectionRequestInput = z.infer<typeof updateCollectionRequestSchema>;

// --- Products ---

const productTaxonomyFields = {
  categoryId: uuidSchema.nullable().optional(),
  subcategory: z.string().trim().max(100).nullable().optional(),
  gender: z.string().trim().max(50).nullable().optional(),
  style: z.string().trim().max(100).nullable().optional(),
  occasion: z.string().trim().max(100).nullable().optional(),
  season: z.string().trim().max(50).nullable().optional(),
  fit: z.string().trim().max(50).nullable().optional(),
  material: z.string().trim().max(100).nullable().optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  imageUrl: z.string().trim().url().nullable().optional(),
};

export const createProductRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: z.string().trim().max(5000).optional(),
  ...productTaxonomyFields,
});
export type CreateProductRequestInput = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
    ...productTaxonomyFields,
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field must be provided");
export type UpdateProductRequestInput = z.infer<typeof updateProductRequestSchema>;

export const listProductsQuerySchema = z.object({
  status: z.enum(["draft", "active", "archived"]).optional(),
  categoryId: uuidSchema.optional(),
  collectionId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListProductsQueryInput = z.infer<typeof listProductsQuerySchema>;

// --- Product variants ---

export const createProductVariantRequestSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  size: z.string().trim().max(50).nullable().optional(),
  color: z.string().trim().max(50).nullable().optional(),
  priceCents: z.number().int().min(0),
});
export type CreateProductVariantRequestInput = z.infer<typeof createProductVariantRequestSchema>;

export const updateProductVariantRequestSchema = z
  .object({
    sku: z.string().trim().min(1).max(100).optional(),
    size: z.string().trim().max(50).nullable().optional(),
    color: z.string().trim().max(50).nullable().optional(),
    priceCents: z.number().int().min(0).optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field must be provided");
export type UpdateProductVariantRequestInput = z.infer<typeof updateProductVariantRequestSchema>;

// --- Inventory ---

export const updateInventoryRequestSchema = z.object({
  quantity: z.number().int().min(0),
});
export type UpdateInventoryRequestInput = z.infer<typeof updateInventoryRequestSchema>;

// --- Admin ---

export const listAuditLogsQuerySchema = z.object({
  tenantId: uuidSchema.optional(),
  actorUserId: uuidSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListAuditLogsQueryInput = z.infer<typeof listAuditLogsQuerySchema>;

export const updatePlatformSettingsRequestSchema = z.object({
  tenantRegistrationOpen: z.boolean(),
});
export type UpdatePlatformSettingsRequestInput = z.infer<typeof updatePlatformSettingsRequestSchema>;

// --- Customer auth (public, per-store - deliberately separate from staff auth schemas above) ---

export const customerRegisterRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(200),
  phone: phoneSchema.nullable().optional(),
});
export type CustomerRegisterRequestInput = z.infer<typeof customerRegisterRequestSchema>;

export const customerLoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type CustomerLoginRequestInput = z.infer<typeof customerLoginRequestSchema>;

// Refresh/logout reuse refreshRequestSchema/logoutRequestSchema above - same {refreshToken} shape,
// no need for customer-specific duplicates.

// --- Checkout ---

export const checkoutRequestSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerEmail: emailSchema,
  customerPhone: phoneSchema,
  shippingAddressLine1: z.string().trim().min(1).max(300),
  shippingAddressLine2: z.string().trim().max(300).nullable().optional(),
  shippingCity: z.string().trim().min(1).max(150),
  shippingRegion: z.string().trim().max(150).nullable().optional(),
  shippingPostalCode: z.string().trim().max(20).nullable().optional(),
  shippingCountry: z.string().trim().min(1).max(100),
  customerNote: z.string().trim().max(1000).nullable().optional(),
  items: z
    .array(
      z.object({
        variantId: uuidSchema,
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1, "at least one item is required"),
});
export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>;

// --- Orders (merchant-side) ---

export const listOrdersQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "fulfilled", "delivered", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListOrdersQueryInput = z.infer<typeof listOrdersQuerySchema>;

export const orderParamsSchema = z.object({
  id: uuidSchema,
  orderId: uuidSchema,
});
export type OrderParamsInput = z.infer<typeof orderParamsSchema>;

export const updateOrderStatusRequestSchema = z.object({
  status: z.enum(["pending", "confirmed", "fulfilled", "delivered", "cancelled"]),
});
export type UpdateOrderStatusRequestInput = z.infer<typeof updateOrderStatusRequestSchema>;

export const updateOrderPaymentRequestSchema = z.object({
  status: z.enum(["collected", "failed"]),
});
export type UpdateOrderPaymentRequestInput = z.infer<typeof updateOrderPaymentRequestSchema>;
