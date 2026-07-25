import { useQuery } from "@tanstack/react-query";
import { Card, Table } from "@fashion-platform/ui";
import type { PlatformAnalytics } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";

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
  const analyticsQuery = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: () => apiClient.adminGetAnalytics(),
  });

  if (analyticsQuery.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  const analytics = analyticsQuery.data;
  if (!analytics) return <p className="text-sm text-red-600">Could not load analytics.</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Active stores" value={String(analytics.tenantsByStatus.active)} />
        <StatTile label="Pending approval" value={String(analytics.tenantsByStatus.pending_approval)} />
        <StatTile label="Orders (excl. cancelled)" value={String(analytics.totalOrders)} />
        <StatTile label="Revenue (excl. cancelled)" value={formatMoney(analytics.totalRevenueCents)} />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Tenants by status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            Object.entries(analytics.tenantsByStatus) as Array<[keyof PlatformAnalytics["tenantsByStatus"], number]>
          ).map(([status, count]) => (
            <div key={status} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-600">{status}</span>
              <span className="font-semibold text-slate-900">{count}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Orders by status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            Object.entries(analytics.ordersByStatus) as Array<[keyof PlatformAnalytics["ordersByStatus"], number]>
          ).map(([status, count]) => (
            <div key={status} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-600">{status}</span>
              <span className="font-semibold text-slate-900">{count}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Top products (platform-wide)</h2>
        <Table
          columns={[
            {
              key: "product",
              header: "Product",
              render: (row: PlatformAnalytics["topProducts"][number]) => row.productName,
            },
            {
              key: "store",
              header: "Store",
              render: (row: PlatformAnalytics["topProducts"][number]) => row.tenantName,
            },
            {
              key: "units",
              header: "Units sold",
              render: (row: PlatformAnalytics["topProducts"][number]) => row.quantitySold,
            },
            {
              key: "revenue",
              header: "Revenue",
              render: (row: PlatformAnalytics["topProducts"][number]) => formatMoney(row.revenueCents),
            },
          ]}
          rows={analytics.topProducts}
          getRowKey={(row) => `${row.tenantId}-${row.productName}`}
          emptyMessage="No orders yet."
        />
      </Card>
    </div>
  );
}
