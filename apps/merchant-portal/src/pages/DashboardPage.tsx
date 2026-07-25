import { useQuery } from "@tanstack/react-query";
import { Card } from "@fashion-platform/ui";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

export function DashboardPage() {
  const { tenantId } = useTenantContext();
  const tenantQuery = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => apiClient.getTenant(tenantId),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <Card>
        <p className="text-sm text-slate-500">Store status</p>
        <p className="mt-1 text-lg font-medium text-slate-900">
          {tenantQuery.isLoading ? "Loading…" : tenantQuery.data?.status}
        </p>
        {tenantQuery.data?.status === "pending_approval" ? (
          <p className="mt-2 text-sm text-amber-700">
            Your store is awaiting Super Admin approval before it can go live.
          </p>
        ) : null}
      </Card>
      <Card>
        <p className="text-sm text-slate-500">
          Order and revenue analytics will appear here in a future release.
        </p>
      </Card>
    </div>
  );
}
