import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Table } from "@fashion-platform/ui";
import type { OrderListItem, OrderStatus } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

const STATUS_TONE: Record<OrderStatus, "neutral" | "success" | "warning" | "danger"> = {
  pending: "warning",
  confirmed: "neutral",
  fulfilled: "neutral",
  delivered: "success",
  cancelled: "danger",
};

const STATUS_OPTIONS: Array<OrderStatus | "all"> = [
  "all",
  "pending",
  "confirmed",
  "fulfilled",
  "delivered",
  "cancelled",
];

export function OrdersPage() {
  const { tenantId } = useTenantContext();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");

  const ordersQuery = useQuery({
    queryKey: ["orders", tenantId, statusFilter],
    queryFn: () => apiClient.listOrders(tenantId, statusFilter === "all" ? {} : { status: statusFilter }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Orders</h1>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "all")}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All statuses" : option}
            </option>
          ))}
        </select>
      </div>
      <Card>
        <Table
          columns={[
            {
              key: "customer",
              header: "Customer",
              render: (row: OrderListItem) => (
                <Link to={`/orders/${row.id}`} className="font-medium text-slate-900 hover:underline">
                  {row.customerName}
                </Link>
              ),
            },
            { key: "items", header: "Items", render: (row: OrderListItem) => row.itemCount },
            {
              key: "total",
              header: "Total",
              render: (row: OrderListItem) => `$${(row.totalCents / 100).toFixed(2)}`,
            },
            {
              key: "status",
              header: "Status",
              render: (row: OrderListItem) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>,
            },
            {
              key: "placed",
              header: "Placed",
              render: (row: OrderListItem) => new Date(row.createdAt).toLocaleString(),
            },
          ]}
          rows={ordersQuery.data ?? []}
          getRowKey={(row) => row.id}
          emptyMessage={
            ordersQuery.isLoading ? "Loading…" : "No orders yet — they'll show up here once customers start checking out."
          }
        />
      </Card>
    </div>
  );
}
