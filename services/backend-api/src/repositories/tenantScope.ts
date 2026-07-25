/**
 * The tenant-isolation mechanism for Increment 1: every repository function
 * that touches a tenant-owned table (tenant_memberships, stores) takes a
 * TenantScope resolved server-side by tenantContext middleware, and
 * unconditionally ANDs `tenant_id = scope.tenantId` into its query. Feature
 * code (routes) never imports these tables directly - only through the
 * factories in this directory - so there is no code path that can query a
 * tenant-owned table without a tenant filter.
 *
 * The `tenants` table itself has no `tenant_id` column (its own id IS the
 * tenant id), so its "self scope" is enforced by filtering on `id` instead -
 * see tenantsRepo.getOwn/updateOwn. Cross-tenant access to any of these
 * tables goes exclusively through adminScopedRepo.ts, which requires an
 * admin permission check and always writes an audit_logs row.
 */
export interface TenantScope {
  tenantId: string;
}
