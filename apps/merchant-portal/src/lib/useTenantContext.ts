import { useOutletContext } from "react-router-dom";

export interface TenantRouteContext {
  tenantId: string;
  roleKey: string;
}

export function useTenantContext(): TenantRouteContext {
  return useOutletContext<TenantRouteContext>();
}
