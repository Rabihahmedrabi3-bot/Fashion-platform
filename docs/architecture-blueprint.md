# Multi-Tenant Fashion Commerce Platform — Phase 0 Architecture Blueprint

**Status:** Draft for review. No production implementation has started.
**Goal of this document:** Shared understanding of the product, boundaries, and MVP before a single line of production code is written, per your engineering rules.

---

## 1. Understanding of the Product

Two connected products sharing one data platform:

- **Fashion Store SaaS** — individual stores run their own tenant: profile, branding, products/variants/inventory, collections, orders, customers, staff, analytics, and eventually subscriptions.
- **Central Marketplace** — a cross-tenant discovery layer where marketplace-eligible products surface for browsing, search, and (eventually) AI-powered styling and outfit-building across stores.

Long-term, an AI intelligence layer sits *on top of* structured catalog data (not on top of free-text descriptions) to do intent understanding → catalog search → recommendation → outfit building → explainability → item-swap. Beyond that, a four-level visual roadmap: outfit boards → AI-generated visualizations → virtual mannequins → virtual try-on.

The core tension to design around: **build a real, sellable single-store SaaS product now, without foreclosing the marketplace/AI/visual future.** That means getting the tenant, catalog, and order models right early, even though marketplace and AI stay out of the MVP.

---

## 2. Proposed System Boundaries

**In scope for MVP:**
Tenant/store management, RBAC, product & variant catalog (with a *minimal* structured-attribute schema — see §6), inventory, collections, single-store orders, customer accounts, staff permissions, a templated (non-builder) storefront, and a Super Admin portal for tenant approval and platform oversight.

**Explicitly out of scope for MVP** (designed for, not built):
- Central marketplace UI (browsing/search across stores)
- Any AI feature — search, recommendation, outfit building
- Multi-store orders / parent-order + sub-order execution
- Visual AI (all 4 levels)
- Unrestricted storefront builder
- Payouts, refunds, split settlement
- Subscription billing enforcement (schema can exist; billing logic doesn't need to)

This matches your own rule set: don't build screens implying backend capability that isn't there, don't add features because they're future possibilities.

---

## 3. Recommended MVP

A **store owner can go from signup to taking real orders on their own storefront**, and a **Super Admin can approve and oversee tenants**. Concretely:

1. Tenant/store creation + Super Admin approval workflow
2. Store Owner + Staff accounts with role-based permissions
3. Product, variant, size/color, inventory CRUD
4. Categories and collections
5. Templated storefront (component-based theming, not a builder) rendered per store, single-store checkout and cart
6. Order management (single-store only), customer accounts
7. Basic analytics (orders, revenue, top products — real numbers only, computed from actual order data)
8. Platform-level tenant management, moderation, and settings

No marketplace, no AI, in the first shippable version. The catalog is built with structured attributes from day one so Phase 2 AI isn't a retrofit (see §6).

---

## 4. Proposed Architecture

**Backend:** Node.js + TypeScript + PostgreSQL — consistent with your existing stack across NOVA and the delivery app, and a good fit here (strong relational modeling for tenants/orders, mature ecosystem, your team already knows it). REST API with schema validation at the boundary (e.g. zod), or tRPC if the frontend is also TypeScript and you want end-to-end type safety.

**Multi-tenancy:** Shared database, every tenant-owned table carries `tenant_id`. Enforcement happens at the **application data-access layer** — a query-building layer that makes it structurally impossible to run a tenant-scoped query without a tenant filter (not something engineers have to "remember" per query). Postgres Row-Level Security can be layered on top later as defense-in-depth, not as the primary mechanism initially (this is one of the decisions below — there's a real tradeoff between shipping speed and starting with the stronger guarantee).

**Auth & Authorization:** JWT-based sessions carrying `user_id`, `tenant_id` (where applicable), and role. RBAC with a Role → Permission model (not just fixed role enums) so Store Owners can eventually configure Staff permissions without new code. Super Admin auth is a distinct scope, never inferred from a "just trust the frontend" flag.

**Storefront theming:** A structured, component-based theme system — logo, brand colors, typography tokens, a fixed set of homepage section *types* (hero, featured collection, banner, product grid) that stores configure with data, not code. This gives real visual differentiation without becoming a website builder.

**Media:** Object storage (S3-compatible) + CDN, referenced by product/variant records, not stored in the DB.

**AI boundary (for later, designed now):** A separate service that only *reads* structured catalog data through an internal API — it never writes to the catalog and never becomes the source of truth for product data. This keeps the AI layer swappable/removable without touching core commerce logic.

**Order architecture:** MVP implements single-store orders directly, but the schema is shaped so a `ParentOrder` → `StoreSubOrder` split can be introduced later without a breaking migration (an order today is logically "a parent order with exactly one sub-order").

**Delivery:** Abstracted behind a `DeliveryProvider` interface from day one — mirrors the adapter pattern you already used in the delivery-app project — so internal ops, external couriers, or a future dedicated delivery service can plug in without touching order logic.

---

## 5. Recommended Application Structure

| App | Users | Notes |
|---|---|---|
| **Super Admin Portal** | Platform Super Admin | Separate deployable web app |
| **Merchant Portal** | Store Owner, Staff | Separate deployable web app |
| **Storefront** | Customers | Public, per-store, subdomain-based (`store.platform.com`) or path-based initially — see decisions |
| **Central Marketplace** | Customers | Public, cross-tenant — **Phase 2**, not MVP |
| **Customer Account** | Customers | Lives inside Storefront/Marketplace rather than a separate app — no reason to split this out |

**Recommendation:** a monorepo (pnpm/Turborepo) with shared packages (design system/UI kit, shared types, API client, validation schemas) but **separately deployable** apps per portal. This gets you consistency and code reuse without coupling deploy cycles — Admin and Merchant Portal can ship independently, and the Storefront (customer-facing, SEO-sensitive) can be optimized differently (SSR/SSG) than the internal portals.

Web (React/Next.js or similar) is the natural choice here rather than Flutter — storefronts and the future marketplace need SEO and shareable public URLs, which native/Flutter-web doesn't give you for free.

---

## 6. Proposed Domain Model

**MVP entities:**
`User`, `Tenant`, `TenantMembership`, `Role`, `Permission`, `Store`, `Product`, `ProductVariant`, `Category`, `Collection`, `Inventory`, `Customer`, `Cart`, `Order`, `OrderItem`

**Included in MVP but deliberately minimal — one exception to "don't build for the future":**
`ProductAttribute` (structured fashion taxonomy: category, subcategory, gender, style, occasion, season, fit, color, material, brand). This is the one place I'd deviate from strict MVP minimalism: retrofitting structured attributes onto an existing catalog of thousands of products later is genuinely painful, and the AI vision explicitly depends on this data existing. A lightweight version (a handful of required fields per product) costs little now and prevents a costly migration later.

**Designed for, not built (future entities):**
`ParentOrder`, `StoreSubOrder`, `MarketplaceListing`, `Outfit`, `AIRecommendation`

**Key relationships (abbreviated):**
```
Tenant 1—* TenantMembership *—1 User
TenantMembership *—1 Role *—* Permission
Tenant 1—1 Store
Store 1—* Product 1—* ProductVariant
Product *—1 Category, Product *—* Collection
Product 1—1 ProductAttribute
ProductVariant 1—1 Inventory
Customer 1—* Order 1—* OrderItem
Order *—1 Store   (future: Order becomes ParentOrder 1—* StoreSubOrder)
```

---

## 7. Security & Tenant-Isolation Strategy

- **No ad-hoc queries.** All tenant-owned data access goes through a data-access layer that requires a tenant context; there is no code path that queries tenant tables without it.
- **Tenant context comes from the authenticated session, never from client input.** A request can't say "give me tenant X's data" by passing an ID in a body/query param — the tenant is resolved server-side from the token.
- **Super Admin cross-tenant access is a distinct, explicitly-checked permission**, and every cross-tenant read/write by an admin is audit-logged.
- **Input validation** at every API boundary (schema validation, not just type hints).
- **Rate limiting** per tenant and per IP.
- **File upload security:** type/size validation before anything touches object storage; images are never trusted as-is.
- **Audit logging** for sensitive actions: tenant approval, role/permission changes, cross-tenant access, staff account changes.
- **Automated tenant-isolation tests are non-negotiable**, per your own rules: CI includes tests that actively attempt cross-tenant reads/writes and assert they fail, not just tests that the happy path works.

---

## 8. Major Risks

**Technical**
- Tenant-isolation bugs are the single highest-severity risk class here — one leaky query can expose a store's private data (customers, orders, revenue) to another tenant.
- Storefront theming scope creep: "structured theming" quietly turning into a full builder if not held to a fixed set of section types.
- Order model: introducing multi-store orders *too early* adds real complexity (splitting payment, partial fulfillment, per-store status) before there's a marketplace that needs it.
- Marketplace search/discovery is a genuinely hard problem once it exists — cross-tenant relevance ranking, availability sync, inventory races across stores.

**Business / operational**
- **Marketplace liquidity chicken-and-egg:** stores won't join a marketplace with no customers; customers won't visit a marketplace with few stores. This argues for nailing the store-SaaS value proposition standalone first (a store should want this tool even if the marketplace never existed) — MVP scoping already reflects that.
- **Merchant onboarding friction** for local fashion stores — photo quality, product data entry effort, and staff comfort with a new tool are real adoption risks independent of the tech.
- **Payments in the Lebanon context:** cash-on-delivery is likely to dominate over online payment gateways early on; this affects how much payment infrastructure is worth building into the MVP versus deferring.

---

## 9. Proposed Development Milestones

**M0 — Foundations**
Scope: tenant/user/role/permission schema, auth, CI, base data-access layer with mandatory tenant scoping.
DB: `User`, `Tenant`, `TenantMembership`, `Role`, `Permission`. API: auth endpoints, tenant bootstrap. UI: none yet (internal only). Tests: auth flows + first tenant-isolation tests. Acceptance: a user can register, be scoped to a tenant, and cross-tenant queries provably fail in tests.

**M1 — Store & Catalog (Merchant Portal MVP)**
Scope: store profile, product/variant/inventory CRUD, categories, collections, minimal `ProductAttribute`.
DB: `Store`, `Product`, `ProductVariant`, `Category`, `Collection`, `Inventory`, `ProductAttribute`. API: CRUD endpoints per entity, tenant-scoped. UI: Merchant Portal catalog screens. Tests: CRUD + tenant isolation on all new tables. Acceptance: a store owner can fully manage a catalog visible only to their tenant.

**M2 — Storefront**
Scope: public store page rendering, component-based theming, cart.
DB: theme config fields on `Store`. API: public read endpoints (no auth) for store/product data. UI: Storefront app, cart flow. Tests: public endpoints only expose marketplace-safe/public data, never leak tenant-internal fields. Acceptance: a real customer can browse a live store and build a cart.

**M3 — Orders & Customers**
Scope: checkout, order creation, order management, customer accounts.
DB: `Customer`, `Order`, `OrderItem`. API: checkout, order status, customer auth. UI: checkout flow, Merchant Portal order management, customer order history. Tests: order totals/inventory decrement correctness, tenant isolation on orders. Acceptance: an end-to-end real order can be placed and fulfilled by the store.

**M4 — Super Admin**
Scope: tenant approval/moderation, platform settings, platform-wide (real) analytics.
DB: approval/status fields on `Tenant`, audit log table. API: admin-only endpoints. UI: Super Admin Portal. Tests: cross-tenant access only via explicit admin permission, fully audit-logged. Acceptance: a Super Admin can approve a new store and see real, non-fabricated platform metrics.

**M5 — Marketplace (read-only) — Phase 2, post-MVP**
Cross-tenant browse/search on marketplace-eligible products only, no AI.

**M6 — AI Text Search & Recommendations — Phase 2/3**
Built strictly on top of the `ProductAttribute` structured data laid down in M1.

**M7+ — Visual AI Roadmap — Phase 3/4**
Outfit boards → AI visualization → virtual mannequin → virtual try-on, in that order, each gated on the prior one shipping and being used.

---

## 10. Decisions

**Confirmed:**
1. **Relationship to Project NOVA:** ✅ Completely separate project — no shared infra/codebase assumed. This is a standalone venture; recommendations below no longer reference NOVA reuse.
2. **MVP scope:** ✅ Store-only SaaS. The marketplace (M5) is fully deferred — not even a read-only version ships alongside the store SaaS MVP.
3. **Multi-tenancy enforcement:** ✅ App-layer scoping first (mandatory tenant-scoped data-access layer), Postgres RLS added later as a hardening layer, not a Day-1 requirement.

**Still open — defaults proposed, flag if you want something different:**
4. **Frontend stack:** React/Next.js (SEO for the storefront, standard ecosystem) — proceeding with this unless you object.
5. **Repo strategy:** monorepo (pnpm/Turborepo) with separately deployable apps — proceeding with this.
6. **Storefront addressing:** subdomain per store (`store.platform.com`) at launch, custom domains later — proceeding with this.
7. **Payments:** cash-on-delivery first, online gateway integration deferred — proceeding with this given the Lebanon market.
8. **Structured attributes in MVP:** minimal `ProductAttribute` set included now — proceeding with this (per §6 rationale).
9. **Hosting/infra:** no default assumed — needs your call (Render, or elsewhere).
