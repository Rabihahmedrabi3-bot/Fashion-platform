// @fashion-platform/api-client
// A small typed fetch wrapper around backend-api, shared by every frontend
// app. Handles the access/refresh token lifecycle (refresh-on-401, using
// the same rotating refresh flow the backend implements) so screens never
// have to think about it.

import type {
  AuditLog,
  Category,
  Collection,
  LoginRequest,
  MeResponse,
  Order,
  OrderListItem,
  OrderPayment,
  OrderWithDetails,
  Permission,
  PlatformAnalytics,
  PlatformSettings,
  ProductListItem,
  ProductVariant,
  ProductVariantWithInventory,
  ProductWithVariants,
  RegisterRequest,
  TenantAnalytics,
  TenantMembershipStatus,
  TenantStatus,
  ThemeConfig,
} from "@fashion-platform/shared-types";
import type {
  CreateCategoryRequestInput,
  CreateCollectionRequestInput,
  CreateProductRequestInput,
  CreateProductVariantRequestInput,
  CreateTenantRequestInput,
  InviteMembershipRequestInput,
  ListAuditLogsQueryInput,
  ListOrdersQueryInput,
  ListProductsQueryInput,
  RejectOrSuspendTenantRequestInput,
  RequestPasswordResetRequestInput,
  ResetPasswordRequestInput,
  UpdateCategoryRequestInput,
  UpdateCollectionRequestInput,
  UpdateMembershipRequestInput,
  UpdateOrderPaymentRequestInput,
  UpdateOrderStatusRequestInput,
  UpdatePlatformSettingsRequestInput,
  UpdateProductRequestInput,
  UpdateProductVariantRequestInput,
  UpdateStoreRequestInput,
  VerifyEmailRequestInput,
} from "@fashion-platform/validation";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ApiClientOptions {
  baseUrl: string;
  /**
   * Separate getters, not one combined TokenPair: on app startup the
   * refresh token can be present (persisted) while the access token isn't
   * (kept in memory only) - a combined getter would make that bootstrap
   * case indistinguishable from "not logged in".
   */
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokensRefreshed: (tokens: TokenPair) => void;
  /** Called when the refresh token itself is rejected - the caller should treat this as a logout. */
  onSessionExpired: () => void;
}

export interface RegisterResponse {
  id: string;
  email: string;
  status: string;
}

export interface CreateTenantResponse {
  tenant: { id: string; name: string; slug: string; status: TenantStatus };
  store: { id: string; slug: string; status: string };
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
}

export interface StoreSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  brandingLogoUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingSecondaryColor: string | null;
  brandingThemeConfig: ThemeConfig;
  marketplaceEligible: boolean;
  whatsappNumber: string | null;
}

export interface MembershipListItem {
  id: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  roleKey: string;
  status: TenantMembershipStatus;
}

export interface RoleSummary {
  id: string;
  key: string;
  name: string;
}

async function parseJsonSafely(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

export class ApiClient {
  private readonly options: ApiClientOptions;

  constructor(options: ApiClientOptions) {
    this.options = options;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    { auth = true, allowRetry = true }: { auth?: boolean; allowRetry?: boolean } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    // FormData bodies must NOT get a manual Content-Type - the browser sets
    // the multipart boundary itself; overriding it breaks the upload.
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    if (auth) {
      const accessToken = this.options.getAccessToken();
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const res = await fetch(`${this.options.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401 && auth && allowRetry) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(path, init, { auth, allowRetry: false });
      }
      this.options.onSessionExpired();
      throw new ApiError(401, "Session expired", null);
    }

    if (!res.ok) {
      const body = await parseJsonSafely(res);
      throw new ApiError(res.status, errorMessageFrom(body, res.statusText), body);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** Also used directly by callers to bootstrap a fresh access token on app startup from a persisted refresh token. */
  async tryRefresh(): Promise<boolean> {
    const refreshToken = this.options.getRefreshToken();
    if (!refreshToken) return false;

    const res = await fetch(`${this.options.baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;

    const refreshed = (await res.json()) as TokenPair;
    this.options.onTokensRefreshed(refreshed);
    return true;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private post<T>(path: string, body?: unknown, opts?: { auth?: boolean }): Promise<T> {
    return this.request<T>(
      path,
      { method: "POST", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) },
      opts,
    );
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  }

  private postFormData<T>(path: string, formData: FormData): Promise<T> {
    return this.request<T>(path, { method: "POST", body: formData });
  }

  private delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  // --- Auth ---

  register(input: RegisterRequest): Promise<RegisterResponse> {
    return this.post("/auth/register", input, { auth: false });
  }

  verifyEmail(input: VerifyEmailRequestInput): Promise<{ status: string }> {
    return this.post("/auth/verify-email", input, { auth: false });
  }

  login(input: LoginRequest): Promise<TokenPair> {
    return this.post("/auth/login", input, { auth: false });
  }

  logout(refreshToken: string): Promise<void> {
    return this.post("/auth/logout", { refreshToken });
  }

  requestPasswordReset(input: RequestPasswordResetRequestInput): Promise<{ status: string }> {
    return this.post("/auth/request-password-reset", input, { auth: false });
  }

  resetPassword(input: ResetPasswordRequestInput): Promise<{ status: string }> {
    return this.post("/auth/reset-password", input, { auth: false });
  }

  // --- Users ---

  getMe(): Promise<MeResponse> {
    return this.get("/users/me");
  }

  // --- Tenants ---

  createTenant(input: CreateTenantRequestInput): Promise<CreateTenantResponse> {
    return this.post("/tenants", input);
  }

  getTenant(tenantId: string): Promise<TenantSummary> {
    return this.get(`/tenants/${tenantId}`);
  }

  getStore(tenantId: string): Promise<StoreSummary> {
    return this.get(`/tenants/${tenantId}/store`);
  }

  updateStore(tenantId: string, input: UpdateStoreRequestInput): Promise<StoreSummary> {
    return this.patch(`/tenants/${tenantId}/store`, input);
  }

  uploadStoreLogo(tenantId: string, file: File | Blob): Promise<StoreSummary> {
    const formData = new FormData();
    formData.set("image", file);
    return this.postFormData(`/tenants/${tenantId}/store/logo`, formData);
  }

  uploadThemeHeroImage(tenantId: string, file: File | Blob): Promise<StoreSummary> {
    const formData = new FormData();
    formData.set("image", file);
    return this.postFormData(`/tenants/${tenantId}/store/theme/hero-image`, formData);
  }

  // --- Roles / permissions (read-only reference data) ---

  listRoles(): Promise<RoleSummary[]> {
    return this.get("/roles");
  }

  listPermissions(): Promise<Permission[]> {
    return this.get("/permissions");
  }

  // --- Staff / memberships ---

  listMemberships(tenantId: string): Promise<MembershipListItem[]> {
    return this.get(`/tenants/${tenantId}/memberships`);
  }

  inviteMembership(
    tenantId: string,
    input: InviteMembershipRequestInput,
  ): Promise<{ id: string; status: string; roleKey: string }> {
    return this.post(`/tenants/${tenantId}/memberships`, input);
  }

  updateMembership(
    tenantId: string,
    membershipId: string,
    input: UpdateMembershipRequestInput,
  ): Promise<{ id: string; status: string }> {
    return this.patch(`/tenants/${tenantId}/memberships/${membershipId}`, input);
  }

  revokeMembership(tenantId: string, membershipId: string): Promise<void> {
    return this.delete(`/tenants/${tenantId}/memberships/${membershipId}`);
  }

  // --- Categories ---

  listCategories(tenantId: string): Promise<Category[]> {
    return this.get(`/tenants/${tenantId}/categories`);
  }

  createCategory(tenantId: string, input: CreateCategoryRequestInput): Promise<Category> {
    return this.post(`/tenants/${tenantId}/categories`, input);
  }

  updateCategory(tenantId: string, categoryId: string, input: UpdateCategoryRequestInput): Promise<Category> {
    return this.patch(`/tenants/${tenantId}/categories/${categoryId}`, input);
  }

  deleteCategory(tenantId: string, categoryId: string): Promise<void> {
    return this.delete(`/tenants/${tenantId}/categories/${categoryId}`);
  }

  // --- Collections ---

  listCollections(tenantId: string): Promise<Collection[]> {
    return this.get(`/tenants/${tenantId}/collections`);
  }

  createCollection(tenantId: string, input: CreateCollectionRequestInput): Promise<Collection> {
    return this.post(`/tenants/${tenantId}/collections`, input);
  }

  updateCollection(
    tenantId: string,
    collectionId: string,
    input: UpdateCollectionRequestInput,
  ): Promise<Collection> {
    return this.patch(`/tenants/${tenantId}/collections/${collectionId}`, input);
  }

  deleteCollection(tenantId: string, collectionId: string): Promise<void> {
    return this.delete(`/tenants/${tenantId}/collections/${collectionId}`);
  }

  // --- Products ---

  listProducts(tenantId: string, query: ListProductsQueryInput = {}): Promise<ProductListItem[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const suffix = params.toString();
    return this.get(`/tenants/${tenantId}/products${suffix ? `?${suffix}` : ""}`);
  }

  getProduct(tenantId: string, productId: string): Promise<ProductWithVariants> {
    return this.get(`/tenants/${tenantId}/products/${productId}`);
  }

  createProduct(tenantId: string, input: CreateProductRequestInput): Promise<ProductWithVariants> {
    return this.post(`/tenants/${tenantId}/products`, input);
  }

  updateProduct(
    tenantId: string,
    productId: string,
    input: UpdateProductRequestInput,
  ): Promise<ProductWithVariants> {
    return this.patch(`/tenants/${tenantId}/products/${productId}`, input);
  }

  archiveProduct(tenantId: string, productId: string): Promise<void> {
    return this.delete(`/tenants/${tenantId}/products/${productId}`);
  }

  uploadProductImage(tenantId: string, productId: string, file: File | Blob): Promise<ProductWithVariants> {
    const formData = new FormData();
    formData.set("image", file);
    return this.postFormData(`/tenants/${tenantId}/products/${productId}/image`, formData);
  }

  createVariant(
    tenantId: string,
    productId: string,
    input: CreateProductVariantRequestInput,
  ): Promise<ProductVariantWithInventory> {
    return this.post(`/tenants/${tenantId}/products/${productId}/variants`, input);
  }

  updateVariant(
    tenantId: string,
    productId: string,
    variantId: string,
    input: UpdateProductVariantRequestInput,
  ): Promise<ProductVariant> {
    return this.patch(`/tenants/${tenantId}/products/${productId}/variants/${variantId}`, input);
  }

  archiveVariant(tenantId: string, productId: string, variantId: string): Promise<ProductVariant> {
    return this.delete(`/tenants/${tenantId}/products/${productId}/variants/${variantId}`);
  }

  updateInventory(
    tenantId: string,
    productId: string,
    variantId: string,
    quantity: number,
  ): Promise<{ quantity: number }> {
    return this.patch(`/tenants/${tenantId}/products/${productId}/variants/${variantId}/inventory`, { quantity });
  }

  addProductToCollection(tenantId: string, productId: string, collectionId: string): Promise<void> {
    return this.post(`/tenants/${tenantId}/products/${productId}/collections/${collectionId}`);
  }

  removeProductFromCollection(tenantId: string, productId: string, collectionId: string): Promise<void> {
    return this.delete(`/tenants/${tenantId}/products/${productId}/collections/${collectionId}`);
  }

  // --- Orders ---

  listOrders(tenantId: string, query: ListOrdersQueryInput = {}): Promise<OrderListItem[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const suffix = params.toString();
    return this.get(`/tenants/${tenantId}/orders${suffix ? `?${suffix}` : ""}`);
  }

  getOrder(tenantId: string, orderId: string): Promise<OrderWithDetails> {
    return this.get(`/tenants/${tenantId}/orders/${orderId}`);
  }

  updateOrderStatus(tenantId: string, orderId: string, input: UpdateOrderStatusRequestInput): Promise<Order> {
    return this.patch(`/tenants/${tenantId}/orders/${orderId}/status`, input);
  }

  updateOrderPayment(
    tenantId: string,
    orderId: string,
    input: UpdateOrderPaymentRequestInput,
  ): Promise<OrderPayment> {
    return this.patch(`/tenants/${tenantId}/orders/${orderId}/payment`, input);
  }

  getAnalytics(tenantId: string): Promise<TenantAnalytics> {
    return this.get(`/tenants/${tenantId}/analytics`);
  }

  // --- Admin (Super Admin Portal) ---

  adminListTenants(status?: TenantStatus): Promise<TenantSummary[]> {
    return this.get(`/admin/tenants${status ? `?status=${status}` : ""}`);
  }

  adminApproveTenant(tenantId: string): Promise<{ id: string; status: string }> {
    return this.post(`/admin/tenants/${tenantId}/approve`);
  }

  adminRejectTenant(
    tenantId: string,
    input: RejectOrSuspendTenantRequestInput = {},
  ): Promise<{ id: string; status: string }> {
    return this.post(`/admin/tenants/${tenantId}/reject`, input);
  }

  adminSuspendTenant(
    tenantId: string,
    input: RejectOrSuspendTenantRequestInput = {},
  ): Promise<{ id: string; status: string }> {
    return this.post(`/admin/tenants/${tenantId}/suspend`, input);
  }

  adminListAuditLogs(query: ListAuditLogsQueryInput = {}): Promise<AuditLog[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const suffix = params.toString();
    return this.get(`/admin/audit-logs${suffix ? `?${suffix}` : ""}`);
  }

  adminGetSettings(): Promise<PlatformSettings> {
    return this.get("/admin/settings");
  }

  adminUpdateSettings(input: UpdatePlatformSettingsRequestInput): Promise<PlatformSettings> {
    return this.patch("/admin/settings", input);
  }

  adminGetAnalytics(): Promise<PlatformAnalytics> {
    return this.get("/admin/analytics");
  }
}
