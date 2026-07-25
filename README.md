# Fashion Platform

Multi-tenant fashion commerce platform — monorepo.

## Status

Milestone 0 / Step 1 (Repository and Tooling Foundation) only. No auth, tenant,
database, or business logic has been implemented yet — see
`milestone-0-implementation-spec.md` for the full plan and
`docs/architecture-blueprint.md` for the product/architecture context.

## Structure

```
apps/             Frontend applications (placeholders until Release 3+)
packages/         Shared libraries (config, types, validation, domain logic, UI, API client)
services/
  backend-api/    The Node.js/TypeScript API — the only workspace with real code right now
```

## Requirements

- Node.js 22+ (see `.nvmrc`)
- npm 10+

## Getting started

```bash
npm install
npm run typecheck
npm run lint
npm run test
```

To run the backend API in dev mode:

```bash
cd services/backend-api
cp .env.example .env
npm run dev
```

Then `GET http://localhost:4000/health` should return `{"status":"ok"}`.

## Conventions

- TypeScript everywhere, strict mode, shared base config in `packages/config/tsconfig.base.json`.
- Single root ESLint (flat config) + Prettier for the whole repo — no per-package lint config.
- Vitest for tests, colocated per workspace (`services/*/test`, later `packages/*/test`).
- Tenant-owned data is only ever accessed through the tenant-scoped data-access
  layer described in the Milestone 0 spec — this is a hard rule, not a
  convention, once Step 2+ lands.
