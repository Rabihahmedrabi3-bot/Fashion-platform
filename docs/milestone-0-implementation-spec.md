# Milestone 0 — Implementation Specification
## Multi-Tenant Fashion Commerce Platform — Platform Foundation

**Status:** Specification for review. No production code has been written.

---

## 1. Confirmation of Understanding

Building the **first release (Platform Foundation)** of a standalone multi-tenant fashion SaaS: auth, tenants, tenant membership, RBAC, Super Admin foundation, tenant approval, and tenant isolation enforced server-side by construction, not convention. Catalog, storefront, and commerce are explicitly out of this milestone — they're Releases 2–4. Marketplace and AI stay out entirely for now. This spec covers only what's needed to ship Release 1 and have it independently testable, per your own sequencing.

---

## 2. Environment Inspection Results

I inspected the actual sandbox this conversation is running in (not your own machine or GitHub account — I have no access to those unless you upload files here or work with me in Claude Code on your own environment):

- `/home/claude` (scratch workspace): empty except default tooling — no project files.
- `/mnt/user-data/uploads`: empty — no repo, schema, or existing code has been provided in this conversation.
- Runtime available in this sandbox: **Node.js v22.22.2, npm 10.9.7**. No PostgreSQL client installed here.

**Conclusion:** this is a greenfield project as far as this conversation is concerned — nothing to reuse or avoid overwriting, no existing conventions to preserve. If you already have a scaffold, package.json, or infra set up on your own machine or in a repo (the way NOVA and the delivery app have real GitHub repos), that's the actual environment discovery should happen against — the natural place to do that is a **Claude Code session pointed at that repo**, where I can run `git log`, inspect `package.json`, existing migrations, etc. before touching anything. If you want, I can pick this back up there once a repo exists; for now this spec assumes a fresh initialization.

---

## 3. Proposed Repository Structure

```
apps/
├── admin-portal/          # Super Admin web app
├── merchant-portal/       # Store Owner / Staff web app
└── storefront/            # Public customer-facing web app
packages/
├── ui/                    # Shared design system / component library
├── shared-types/          # Shared TS types (domain entities, API contracts)
├── validation/            # Shared zod schemas (request/response validation)
├── api-client/            # Typed client wrapping the backend API
├── config/                # Shared lint/tsconfig/build config
└── domain-shared/         # Shared pure domain logic (e.g. permission-check helpers)
services/
└── backend-api/           # Node.js/TypeScript API — auth, tenants, RBAC, stores
```

Only `services/backend-api`, `packages/shared-types`, `packages/validation`, and `packages/domain-shared` are actually touched in Milestone 0 — the apps and remaining packages are scaffolded empty or deferred until Release 3, so this milestone stays small.

---

## 4. Database Schema (Milestone 0 tables only)

Conventions: UUID primary keys, `created_at`/`updated_at` on every table, soft status fields instead of hard deletes where auditability matters.

```
users
  id                 uuid PK
  email              varchar UNIQUE NOT NULL
  password_hash      varchar NOT NULL
  full_name          varchar NOT NULL
  status             enum('pending_verification','active','suspended') NOT NULL DEFAULT 'pending_verification'
  email_verified_at  timestamptz NULL
  created_at         timestamptz NOT NULL DEFAULT now()
  updated_at         timestamptz NOT NULL DEFAULT now()
  INDEX (email)  -- backs the UNIQUE constraint

tenants
  id             uuid PK
  name           varchar NOT NULL
  slug           varchar UNIQUE NOT NULL      -- used for subdomain resolution
  status         enum('pending_approval','active','suspended','rejected') NOT NULL DEFAULT 'pending_approval'
  approved_at    timestamptz NULL
  approved_by    uuid NULL REFERENCES users(id)
  created_at     timestamptz NOT NULL DEFAULT now()
  updated_at     timestamptz NOT NULL DEFAULT now()
  INDEX (slug), INDEX (status)

tenant_memberships
  id           uuid PK
  tenant_id    uuid NOT NULL REFERENCES tenants(id)
  user_id      uuid NOT NULL REFERENCES users(id)
  role_id      uuid NOT NULL REFERENCES roles(id)
  status       enum('invited','active','revoked') NOT NULL DEFAULT 'invited'
  invited_by   uuid NULL REFERENCES users(id)
  created_at   timestamptz NOT NULL DEFAULT now()
  updated_at   timestamptz NOT NULL DEFAULT now()
  UNIQUE (tenant_id, user_id)
  INDEX (user_id), INDEX (tenant_id)

roles
  id          uuid PK
  tenant_id   uuid NULL REFERENCES tenants(id)   -- NULL = platform/system role (e.g. super_admin)
  key         varchar NOT NULL                    -- e.g. 'store_owner', 'super_admin'
  name        varchar NOT NULL
  is_system   boolean NOT NULL DEFAULT true        -- predefined vs future custom roles
  created_at  timestamptz NOT NULL DEFAULT now()
  updated_at  timestamptz NOT NULL DEFAULT now()
  UNIQUE (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), key)  -- partial-unique pattern

permissions
  id           uuid PK
  key          varchar UNIQUE NOT NULL   -- e.g. 'product:create', 'tenant:approve'
  resource     varchar NOT NULL
  action       varchar NOT NULL
  description  varchar NOT NULL

role_permissions
  role_id        uuid NOT NULL REFERENCES roles(id)
  permission_id  uuid NOT NULL REFERENCES permissions(id)
  PRIMARY KEY (role_id, permission_id)

stores
  id                     uuid PK
  tenant_id              uuid UNIQUE NOT NULL REFERENCES tenants(id)
  name                   varchar NOT NULL
  slug                   varchar UNIQUE NOT NULL   -- slug.platform-domain.com
  status                 enum('draft','pending_approval','active','suspended') NOT NULL DEFAULT 'draft'
  branding_logo_url      varchar NULL
  branding_primary_color varchar NULL
  branding_theme_config  jsonb NOT NULL DEFAULT '{}'
  created_at             timestamptz NOT NULL DEFAULT now()
  updated_at             timestamptz NOT NULL DEFAULT now()
  INDEX (slug), INDEX (status)

audit_logs
  id               uuid PK
  actor_user_id    uuid NULL REFERENCES users(id)   -- NULL for system-initiated actions
  actor_type       enum('user','system') NOT NULL
  action           varchar NOT NULL       -- e.g. 'tenant.approve', 'membership.role_change'
  target_type      varchar NOT NULL       -- e.g. 'tenant', 'store', 'user'
  target_id        uuid NOT NULL
  tenant_id        uuid NULL REFERENCES tenants(id)  -- the affected tenant, if any
  metadata         jsonb NOT NULL DEFAULT '{}'
  created_at       timestamptz NOT NULL DEFAULT now()
  INDEX (tenant_id), INDEX (actor_user_id), INDEX (created_at)
```

**Ownership rules:** `users`, `roles` (where `tenant_id IS NULL`), `permissions`, `role_permissions` are platform-owned. `tenants`, `tenant_memberships`, `stores` are tenant-owned. `stores.branding_*` (once `status = active`) is the public-data subset. `users.email`/`password_hash` are never exposed cross-tenant, including to Super Admin, outside of an explicit, audited support action.

---

## 5. Authorization Matrix

Each cell is shorthand for a set of individual rows in `role_permissions` (one row per `permission.key`) — this table is the human-readable view of that data, not a separate mechanism.

| Resource | Super Admin | Store Owner | Store Manager | Catalog Manager | Order Manager | Staff (Basic) |
|---|---|---|---|---|---|---|
| Store settings / branding | R (cross-tenant, audited) | CRUD | RU | R | R | R |
| Tenant staff & roles | R (audited) | CRUD | RU (cannot create Owner) | – | – | – |
| Products, variants, categories, collections | R (audited) | CRUD | CRUD | CRUD | R | R |
| Inventory | R (audited) | CRUD | CRUD | CRUD | RU (fulfillment adjustments) | R |
| Customers | R (audited, support only) | CRUD | CRUD | – | RU | R |
| Orders | R (audited) | CRUD | CRUD | – | CRUD | R (view only) |
| Store analytics | R (audited) | R | R | – | R (order metrics) | – |
| Tenant approval / moderation | CRUD (platform-only) | – | – | – | – | – |
| Platform settings | CRUD (platform-only) | – | – | – | – | – |
| Audit logs | R (platform + cross-tenant) | R (own tenant only) | – | – | – | – |

Milestone 0 only needs the rows that are actually exercised: **Store settings, Tenant staff & roles, Tenant approval, Audit logs.** The rest of the matrix is here so Release 2+ permissions slot into the same model without redesign.

---

## 6. Tenant Resolution

- **Authenticated (portal) requests:** the access token carries `user_id` only (see §7 rationale). The server resolves active tenant + role + permissions from `tenant_memberships` on every request — never from a client-supplied tenant ID or a stale token claim.
- **Public storefront requests:** tenant resolved from the request `Host` header → `stores.slug` lookup → `tenant_id`. If no active store matches, return a generic 404 ("store not found") — never distinguish "doesn't exist" from "exists but suspended," to avoid leaking tenant status to the public.
- **Super Admin context:** a separate route namespace (`/admin/*`), requiring a distinct `super_admin` role check (not a boolean flag), with every cross-tenant read/write written to `audit_logs` before the response is returned.
- **Invalid tenant behavior:** any authenticated request where the resolved user has no active membership in the tenant implied by the route returns 403, not 404 — the resource exists, they're just not authorized, and that distinction matters for correct client-side error handling without leaking cross-tenant existence data in ambiguous cases.

---

## 7. Authentication Flow

```
Register (email, password, full name)
    → password hashed (argon2id), user created as pending_verification
    → verification email sent
Verify Email
    → user.status → active
Login (email, password)
    → credentials checked against password_hash
    → access token issued (short-lived, ~15 min) + refresh token (long-lived, stored hashed server-side, revocable)
Session
    → access token carries ONLY user_id + token version (see rationale below)
Tenant Context
    → on each authenticated request, server loads active tenant_memberships for user_id fresh from DB
Authorization
    → permission-check middleware resolves role → permissions for the request's resolved tenant, rejects if missing
```

**Design choice worth flagging explicitly:** the access token intentionally does **not** embed tenant/role/permission claims. Embedding them is faster (no DB lookup) but means a revoked staff account or a changed role stays valid until the token expires. Given tenant isolation and access control are the highest-severity risk here, I'm recommending the DB-resolved-per-request approach — a permission change takes effect on the very next request, not up to 15 minutes later. This costs one extra indexed lookup per request, which is a reasonable trade at this stage.

---

## 8. API Contract (Milestone 0 scope only)

Common error cases apply across all authenticated endpoints unless noted otherwise: `401` (missing/invalid/expired token), `403` (authenticated but not authorized for this tenant/resource), `422` (validation failure), `500` (unhandled). Endpoint-specific errors are called out below.

**Auth**
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | none | `{email, password, fullName}` → `201`; `409` if email exists |
| POST | `/auth/verify-email` | none | `{token}` → `200`; `410` if token expired |
| POST | `/auth/login` | none | `{email, password}` → `{accessToken, refreshToken}`; `401` invalid credentials |
| POST | `/auth/refresh` | refresh token | → new `{accessToken, refreshToken}`; `401` if revoked/expired |
| POST | `/auth/logout` | access token | revokes refresh token → `204` |
| POST | `/auth/request-password-reset` | none | always `200` regardless of whether email exists (no enumeration) |
| POST | `/auth/reset-password` | none | `{token, newPassword}` → `200`; `410` if expired |

**Users**
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/users/me` | access token | returns own profile + active tenant memberships |

**Tenants**
| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| POST | `/tenants` | access token | none (any verified user) | creates tenant + store shell (`status: pending_approval`), caller becomes Store Owner |
| GET | `/tenants/:id` | access token | membership in `:id`, or `tenant:read` (admin) | |
| GET | `/admin/tenants` | access token | `tenant:read` (admin) | filterable by status |
| POST | `/admin/tenants/:id/approve` | access token | `tenant:approve` (admin) | audit-logged, `409` if not `pending_approval` |
| POST | `/admin/tenants/:id/reject` | access token | `tenant:approve` (admin) | audit-logged |
| POST | `/admin/tenants/:id/suspend` | access token | `tenant:suspend` (admin) | audit-logged |

**Memberships**
| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/tenants/:id/memberships` | access token | `staff:read` | |
| POST | `/tenants/:id/memberships` | access token | `staff:create` | invites staff by email + role |
| PATCH | `/tenants/:id/memberships/:membershipId` | access token | `staff:update` | change role/status; cannot elevate to Owner via this endpoint |
| DELETE | `/tenants/:id/memberships/:membershipId` | access token | `staff:delete` | revokes, does not hard-delete |

**Roles & Permissions** *(read-only reference data in Milestone 0)*
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/roles` | access token | predefined system roles |
| GET | `/permissions` | access token | reference list |

**Stores**
| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/public/stores/:slug` | none | – | public fields only, `404` unless `store.status = active` |
| PATCH | `/tenants/:id/store` | access token | `store:update` | branding/profile fields only in M0 |

**Admin**
| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/admin/audit-logs` | access token | `audit:read` (admin) | filterable by tenant, actor, date range |

---

## 9. Data Access Layer — Enforcing Isolation by Construction

Conceptual pattern, not implementation code:

**Unsafe (must be structurally impossible to write):**
```
// Direct query, tenant filter left to the developer to remember
db.query("SELECT * FROM stores WHERE id = $1", [storeId])
```

**Safe (the only pattern the codebase exposes for tenant-owned tables):**
```
// A tenant-scoped repository that requires a tenant context to even construct
const repo = tenantScopedRepo(tenantContext, "stores")
repo.findById(storeId)   // tenant_id filter is injected automatically, cannot be bypassed
```

The mechanism: tenant-owned tables are only ever accessed through a small set of repository functions that take a `TenantContext` (resolved server-side, per §6/§7) as their first argument and inject `WHERE tenant_id = $tenantId` before any other predicate. There is no lower-level "just run SQL" escape hatch available to feature code — if a query needs to bypass tenant scoping (e.g. a genuine Super Admin cross-tenant read), it goes through a separate, explicitly-named `adminScopedRepo` path that requires an admin permission check and always writes an `audit_logs` row. Code review for every PR touching a tenant-owned table checks that it went through one of these two paths and not raw access.

---

## 10. Testing Plan — first tests to write

**Unit**
- Password hashing/verification
- Permission-resolution logic (role → permissions) given a fixture set

**Integration (real test DB)**
- Register → verify → login → refresh → logout, full cycle
- Tenant creation → Store Owner membership auto-created
- Membership invite → accept → role assignment

**Authorization**
- Store Manager cannot invite a Store Owner
- Staff cannot access `/admin/*` routes
- A user with no membership in tenant X gets `403` on tenant X's endpoints

**Tenant isolation (explicit, non-negotiable)**
- Tenant A's authenticated user cannot read Tenant B's store via `/tenants/:id`
- Tenant A's authenticated user cannot update Tenant B's store via `PATCH /tenants/:id/store`
- Tenant A's staff cannot list or modify Tenant B's memberships
- A revoked membership loses access on the very next request (validates the §7 design choice)

**Admin access**
- Non-admin user gets `403` on every `/admin/*` route
- Every successful admin action against a tenant produces exactly one `audit_logs` row with correct `actor_user_id`, `action`, `target_id`

**API**
- Request validation rejects malformed payloads with `422` and a field-level error shape
- `/auth/register` with a duplicate email returns `409`, not a generic `500`

**End-to-end (Milestone 0 slice only)**
- Register → verify → create tenant → tenant shows as `pending_approval` → Super Admin approves → tenant is `active`

---

## 11. Environment Plan

**Environment variables**
```
NODE_ENV
PORT
DATABASE_URL
TEST_DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
REFRESH_TOKEN_HASH_PEPPER
APP_BASE_DOMAIN          # e.g. platform.com — used for subdomain tenant resolution
CORS_ALLOWED_ORIGINS
EMAIL_PROVIDER_API_KEY   # verification / password-reset emails
EMAIL_FROM_ADDRESS
```
Object storage variables are not needed yet — media pipeline is Release 2.

**Local development:** Postgres via Docker Compose, migrations run against `DATABASE_URL`, a seed script creates the platform-level `super_admin` role/permissions and one bootstrap admin user for local testing.

**Test database:** a separate `TEST_DATABASE_URL`, migrated fresh per test run (or per suite), never shares data with dev/prod.

**Production database assumptions:** managed Postgres (exact provider is one of the open decisions below), automated backups, connection pooling in front of the API layer.

**Secrets management:** none of the above are committed; local `.env` (gitignored) for dev, provider-native secrets manager for staging/production.

---

## 12. Milestone 0 Acceptance Criteria

- [ ] A user can register with email + password and receives a verification email.
- [ ] An unverified user cannot log in; a verified user can.
- [ ] A logged-in user can create a tenant, which auto-creates a `Store Owner` membership and a `pending_approval` store.
- [ ] A Store Owner can invite Staff with a specific role; the invited user can accept and gains exactly the permissions their role grants — no more.
- [ ] A Super Admin can list pending tenants, approve one, and the tenant/store transition to `active`; the action is recorded in `audit_logs`.
- [ ] Tenant A's users, regardless of role, receive `403` (not data, not `404` that leaks existence) on every attempt to read or write Tenant B's tenant-owned data — proven by automated test, not manual check.
- [ ] A revoked staff membership loses access on the next request, not after token expiry.
- [ ] Every Super Admin cross-tenant action produces an audit log row with correct actor, action, and target.
- [ ] All tests in §10 pass in CI; type checking and linting pass with zero errors.

---

## 13. Remaining Decisions Requiring Approval

Everything else in the source documents is settled and reflected above. Three concrete technical choices are genuinely still open and not addressed by either document:

1. **ORM / migration tool** for Node.js + TypeScript + PostgreSQL (e.g. Prisma or Drizzle — both are "boring and reliable" per your stated preference; Prisma has more mature migration tooling, Drizzle gives closer-to-SQL control, which matters for the tenant-scoped repository pattern in §9).
2. **Hosting/infra provider** for `services/backend-api` and the Postgres instance — still unset from the earlier blueprint (Render was your existing pattern on the delivery app, but not confirmed for this project).
3. **Primary key strategy**: UUID v4 (simple, default) vs UUID v7/ULID (sortable, better index locality at scale) — low-stakes now, expensive to change later once data exists.

Once these three are set, Milestone 0 implementation can start.
