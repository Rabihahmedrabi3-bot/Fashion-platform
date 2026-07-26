import { useQuery } from "@tanstack/react-query";
import { Card, Table } from "@fashion-platform/ui";
import type { TenantAnalytics } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </Card>
  );
}

export function DashboardPage() {
  const { tenantId } = useTenantContext();
  const tenantQuery = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => apiClient.getTenant(tenantId),
  });
  const analyticsQuery = useQuery({
    queryKey: ["tenant", tenantId, "analytics"],
    queryFn: () => apiClient.getAnalytics(tenantId),
  });

  return (
    <div className="flex flex-col gap-6">
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

      {analyticsQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading analytics…</p>
      ) : !analyticsQuery.data ? (
        <p className="text-sm text-red-600">Could not load analytics.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <StatTile label="Orders (excl. cancelled)" value={String(analyticsQuery.data.totalOrders)} />
            <StatTile label="Revenue (excl. cancelled)" value={formatMoney(analyticsQuery.data.totalRevenueCents)} />
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Orders by status</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                Object.entries(analyticsQuery.data.ordersByStatus) as Array<
                  [keyof TenantAnalytics["ordersByStatus"], number]
                >
              ).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-600">{status}</span>
                  <span className="font-semibold text-slate-900">{count}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Top products</h2>
            <Table
              columns={[
                {
                  key: "product",
                  header: "Product",
                  render: (row: TenantAnalytics["topProducts"][number]) => row.productName,
                },
                {
                  key: "units",
                  header: "Units sold",
                  render: (row: TenantAnalytics["topProducts"][number]) => row.quantitySold,
                },
                {
                  key: "revenue",
                  header: "Revenue",
                  render: (row: TenantAnalytics["topProducts"][number]) => formatMoney(row.revenueCents),
                },
              ]}
              rows={analyticsQuery.data.topProducts}
              getRowKey={(row) => row.productName}
              emptyMessage="No orders yet."
            />
          </Card>
        </>
      )}
    </div>
  );
}
