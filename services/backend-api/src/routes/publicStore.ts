import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  checkoutRequestSchema,
  customerLoginRequestSchema,
  customerRegisterRequestSchema,
  logoutRequestSchema,
  publicProductsQuerySchema,
  refreshRequestSchema,
  type CheckoutRequestInput,
  type CustomerLoginRequestInput,
  type CustomerRegisterRequestInput,
  type LogoutRequestInput,
  type RefreshRequestInput,
} from "@fashion-platform/validation";
import type { CustomerMeResponse, PublicStoreResponse } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import type { Database } from "../db/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { buildNewOrderNotificationEmail, buildOrderConfirmationEmail } from "../lib/email.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { requireParam } from "../lib/params.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { normalizeThemeConfig } from "../lib/themeConfig.js";
import {
  REFRESH_TOKEN_TTL_MS,
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
  verifyAccessToken,
} from "../lib/tokens.js";
import { validateBody } from "../lib/validate.js";
import { requireCustomerAuth } from "../middleware/customerAuth.js";
import { createCustomerRefreshTokensRepo } from "../repositories/customerRefreshTokensRepo.js";
import { createCustomersRepo } from "../repositories/customersRepo.js";
import { createInventoryRepo } from "../repositories/inventoryRepo.js";
import { createMembershipsRepo } from "../repositories/membershipsRepo.js";
import { createOrderPaymentsRepo } from "../repositories/orderPaymentsRepo.js";
import { createOrdersRepo } from "../repositories/ordersRepo.js";
import { createProductVariantsRepo } from "../repositories/productVariantsRepo.js";
import { createProductsRepo } from "../repositories/productsRepo.js";
import {
  findPublicProductBySlug,
  listPublicCategories,
  listPublicProducts,
} from "../repositories/publicCatalogRepo.js";
import { findPublicStoreBySlug, type StoreRow } from "../repositories/storesRepo.js";
import type { TenantScope } from "../repositories/tenantScope.js";

/** Generic 404 - never distinguish "doesn't exist" from "exists but pending/suspended" (Increment 1 rule). */
async function resolveActiveStoreOrNotFound(db: Database, slug: string): Promise<StoreRow> {
  const store = await findPublicStoreBySlug(db, slug);
  if (!store) throw new NotFoundError("store not found");
  return store;
}

export function createPublicStoreRouter(deps: AppDependencies): Router {
  const router = Router();

  // Same brute-force/credential-stuffing protection as /auth (server.ts), scoped to
  // this router instance - customer login/register are as guessable as staff login.
  const customerAuthRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  /** Mirrors auth.ts's issueSession, but signed with jwtCustomerAccessSecret and stored in customer_refresh_tokens. */
  async function issueCustomerSession(
    customerId: string,
    tokenVersion: number,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await signAccessToken({ sub: customerId, tokenVersion }, deps.jwtCustomerAccessSecret);
    const rawRefreshToken = generateOpaqueToken();
    await createCustomerRefreshTokensRepo(deps.db).create(
      customerId,
      hashOpaqueToken(rawRefreshToken, deps.refreshTokenHashPepper),
      new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    );
    return { accessToken, refreshToken: rawRefreshToken };
  }

  router.get(
    "/:slug",
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const response: PublicStoreResponse = {
        name: store.name,
        slug: store.slug,
        brandingLogoUrl: store.brandingLogoUrl,
        brandingPrimaryColor: store.brandingPrimaryColor,
        brandingThemeConfig: normalizeThemeConfig(store.brandingThemeConfig),
      };
      res.status(200).json(response);
    }),
  );

  router.get(
    "/:slug/categories",
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      res.status(200).json(await listPublicCategories(deps.db, store.tenantId));
    }),
  );

  router.get(
    "/:slug/products",
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const query = publicProductsQuerySchema.parse(req.query);
      res.status(200).json(
        await listPublicProducts(deps.db, store.tenantId, {
          categorySlug: query.category,
          collectionSlug: query.collection,
          limit: query.limit,
        }),
      );
    }),
  );

  router.get(
    "/:slug/products/:productSlug",
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const productSlug = requireParam(req.params, "productSlug");
      const product = await findPublicProductBySlug(deps.db, store.tenantId, productSlug);
      if (!product) throw new NotFoundError("product not found");
      res.status(200).json(product);
    }),
  );

  // Order confirmation pages are reached by knowing the order's (unguessable,
  // UUIDv7) id - the same "possession of the id is the access control" model
  // every storefront checkout confirmation page uses. No customer/staff auth
  // is required, and no order-list-by-tenant leak is possible from this route.
  router.get(
    "/:slug/orders/:orderId",
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const scope: TenantScope = { tenantId: store.tenantId };
      const orderId = requireParam(req.params, "orderId");

      const ordersRepo = createOrdersRepo(deps.db, scope);
      const order = await ordersRepo.findById(orderId);
      if (!order) throw new NotFoundError("order not found");

      const [items, payment] = await Promise.all([
        ordersRepo.listItems(orderId),
        createOrderPaymentsRepo(deps.db, scope).findForOrder(orderId),
      ]);
      res.status(200).json({ ...order, items, payment });
    }),
  );

  // --- Customer auth ---

  router.post(
    "/:slug/customers/register",
    customerAuthRateLimiter,
    validateBody(customerRegisterRequestSchema),
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const scope: TenantScope = { tenantId: store.tenantId };
      const input = req.body as CustomerRegisterRequestInput;

      const passwordHash = await hashPassword(input.password);
      const customer = await createCustomersRepo(deps.db, scope).registerOrAdopt({
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        passwordHash,
      });
      if (!customer) throw new ConflictError("an account with this email already exists");

      const session = await issueCustomerSession(customer.id, customer.tokenVersion);
      res.status(201).json(session);
    }),
  );

  router.post(
    "/:slug/customers/login",
    customerAuthRateLimiter,
    validateBody(customerLoginRequestSchema),
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const scope: TenantScope = { tenantId: store.tenantId };
      const { email, password } = req.body as CustomerLoginRequestInput;

      const customer = await createCustomersRepo(deps.db, scope).findByEmail(email);
      if (!customer?.passwordHash || !(await verifyPassword(customer.passwordHash, password))) {
        throw new UnauthorizedError("invalid email or password");
      }

      const session = await issueCustomerSession(customer.id, customer.tokenVersion);
      res.status(200).json(session);
    }),
  );

  router.post(
    "/:slug/customers/refresh",
    validateBody(refreshRequestSchema),
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const scope: TenantScope = { tenantId: store.tenantId };
      const { refreshToken } = req.body as RefreshRequestInput;

      const customerRefreshTokensRepo = createCustomerRefreshTokensRepo(deps.db);
      const tokenHash = hashOpaqueToken(refreshToken, deps.refreshTokenHashPepper);
      const record = await customerRefreshTokensRepo.findActiveByHash(tokenHash);
      if (!record || record.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedError("invalid or expired refresh token");
      }

      // Scoped to this store's tenant - a refresh token from another store's customer resolves to nothing here.
      const customer = await createCustomersRepo(deps.db, scope).findById(record.customerId);
      if (!customer) throw new UnauthorizedError("invalid or expired refresh token");

      await customerRefreshTokensRepo.revoke(record.id);
      const session = await issueCustomerSession(customer.id, customer.tokenVersion);
      res.status(200).json(session);
    }),
  );

  router.post(
    "/:slug/customers/logout",
    requireCustomerAuth(deps),
    validateBody(logoutRequestSchema),
    asyncHandler(async (req, res) => {
      const { refreshToken } = req.body as LogoutRequestInput;
      const customerRefreshTokensRepo = createCustomerRefreshTokensRepo(deps.db);
      const tokenHash = hashOpaqueToken(refreshToken, deps.refreshTokenHashPepper);
      const record = await customerRefreshTokensRepo.findActiveByHash(tokenHash);
      if (record && record.customerId === req.customerId) {
        await customerRefreshTokensRepo.revoke(record.id);
      }
      res.status(204).send();
    }),
  );

  router.get(
    "/:slug/customers/me",
    requireCustomerAuth(deps),
    asyncHandler(async (req, res) => {
      if (!req.customerId) throw new UnauthorizedError("invalid or expired access token");
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const scope: TenantScope = { tenantId: store.tenantId };
      const customer = await createCustomersRepo(deps.db, scope).findById(req.customerId);
      if (!customer) throw new UnauthorizedError("invalid or expired access token");

      const response: CustomerMeResponse = {
        customer: {
          id: customer.id,
          email: customer.email,
          fullName: customer.fullName,
          phone: customer.phone,
        },
      };
      res.status(200).json(response);
    }),
  );

  router.get(
    "/:slug/customers/me/orders",
    requireCustomerAuth(deps),
    asyncHandler(async (req, res) => {
      if (!req.customerId) throw new UnauthorizedError("invalid or expired access token");
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const scope: TenantScope = { tenantId: store.tenantId };
      const rows = await createOrdersRepo(deps.db, scope).list({ customerId: req.customerId });
      res.status(200).json(rows);
    }),
  );

  // --- Checkout ---

  router.post(
    "/:slug/checkout",
    validateBody(checkoutRequestSchema),
    asyncHandler(async (req, res) => {
      const store = await resolveActiveStoreOrNotFound(deps.db, requireParam(req.params, "slug"));
      const scope: TenantScope = { tenantId: store.tenantId };
      const input = req.body as CheckoutRequestInput;

      // Checkout works for both guests and logged-in customers - an optional
      // Bearer token identifies the customer instead of upserting a guest row.
      let authenticatedCustomerId: string | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const payload = await verifyAccessToken(authHeader.slice("Bearer ".length), deps.jwtCustomerAccessSecret);
        if (payload) {
          const customer = await createCustomersRepo(deps.db, scope).findById(payload.sub);
          if (customer && customer.tokenVersion === payload.tokenVersion) {
            authenticatedCustomerId = customer.id;
          }
        }
      }

      // Prices are never trusted from the client - resolved from the live active variant/product.
      const variantsRepo = createProductVariantsRepo(deps.db, scope);
      const productsRepo = createProductsRepo(deps.db, scope);
      const resolvedItems: Array<{
        variantId: string;
        productNameSnapshot: string;
        variantSkuSnapshot: string;
        variantSizeSnapshot: string | null;
        variantColorSnapshot: string | null;
        unitPriceCents: number;
        quantity: number;
        lineTotalCents: number;
      }> = [];

      for (const item of input.items) {
        const variant = await variantsRepo.findById(item.variantId);
        if (!variant || variant.status !== "active") {
          throw new NotFoundError(`variant ${item.variantId} not found`);
        }
        const product = await productsRepo.findById(variant.productId);
        if (!product || product.status !== "active") {
          throw new NotFoundError(`variant ${item.variantId} not found`);
        }
        resolvedItems.push({
          variantId: variant.id,
          productNameSnapshot: product.name,
          variantSkuSnapshot: variant.sku,
          variantSizeSnapshot: variant.size,
          variantColorSnapshot: variant.color,
          unitPriceCents: variant.priceCents,
          quantity: item.quantity,
          lineTotalCents: variant.priceCents * item.quantity,
        });
      }

      const subtotalCents = resolvedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
      const totalCents = subtotalCents;

      // Inventory decrement + order + items + payment all commit or fail together.
      const result = await deps.db.transaction(async (tx) => {
        const inventoryRepo = createInventoryRepo(tx, scope);
        for (const item of resolvedItems) {
          const updated = await inventoryRepo.decrementIfAvailable(item.variantId, item.quantity);
          if (!updated) {
            throw new ConflictError(
              `insufficient stock for ${item.productNameSnapshot} (${item.variantSkuSnapshot})`,
            );
          }
        }

        const customerId =
          authenticatedCustomerId ??
          (
            await createCustomersRepo(tx, scope).upsertGuest({
              email: input.customerEmail,
              fullName: input.customerName,
              phone: input.customerPhone,
            })
          ).id;

        const ordersRepo = createOrdersRepo(tx, scope);
        const order = await ordersRepo.create({
          customerId,
          subtotalCents,
          totalCents,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          shippingAddressLine1: input.shippingAddressLine1,
          shippingAddressLine2: input.shippingAddressLine2,
          shippingCity: input.shippingCity,
          shippingRegion: input.shippingRegion,
          shippingPostalCode: input.shippingPostalCode,
          shippingCountry: input.shippingCountry,
          customerNote: input.customerNote,
        });
        const items = await ordersRepo.createItems(order.id, resolvedItems);
        const payment = await createOrderPaymentsRepo(tx, scope).create(order.id, totalCents);

        return { order, items, payment };
      });

      // Emails fire after the transaction commits - a failed send shouldn't roll back a placed order.
      await deps.emailProvider.send({
        to: input.customerEmail,
        ...buildOrderConfirmationEmail(store.name, result.order.id, totalCents),
      });
      const memberships = await createMembershipsRepo(deps.db, scope).list();
      const owner = memberships.find((m) => m.roleKey === "store_owner" && m.status === "active");
      if (owner) {
        await deps.emailProvider.send({
          to: owner.userEmail,
          ...buildNewOrderNotificationEmail(result.order.id, totalCents),
        });
      }

      res.status(201).json({ ...result.order, items: result.items, payment: result.payment });
    }),
  );

  return router;
}
