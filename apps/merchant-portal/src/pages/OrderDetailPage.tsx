import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card } from "@fashion-platform/ui";
import { ApiError } from "@fashion-platform/api-client";
import type { OrderItem, OrderStatus } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

const STATUS_TONE: Record<OrderStatus, "neutral" | "success" | "warning" | "danger"> = {
  pending: "warning",
  confirmed: "neutral",
  fulfilled: "neutral",
  delivered: "success",
  cancelled: "danger",
};

/** Mirrors services/backend-api/src/routes/orders.ts's LEGAL_TRANSITIONS - the server is the real enforcement, this is just so the UI doesn't offer buttons that will 409. */
const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["fulfilled", "cancelled"],
  fulfilled: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function OrderDetailPage() {
  const { tenantId } = useTenantContext();
  const { orderId } = useParams<{ orderId: string }>();
  const queryClient = useQueryClient();

  const orderQuery = useQuery({
    queryKey: ["order", tenantId, orderId],
    queryFn: () => apiClient.getOrder(tenantId, orderId as string),
  });

  const statusMutation = useMutation({
    mutationFn: (status: OrderStatus) => apiClient.updateOrderStatus(tenantId, orderId as string, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["order", tenantId, orderId] });
      void queryClient.invalidateQueries({ queryKey: ["orders", tenantId] });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: (status: "collected" | "failed") =>
      apiClient.updateOrderPayment(tenantId, orderId as string, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["order", tenantId, orderId] }),
  });

  if (orderQuery.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  const order = orderQuery.data;
  if (!order) return <p className="text-sm text-red-600">Order not found.</p>;

  const nextStatuses = LEGAL_TRANSITIONS[order.status];
  const mutationError =
    statusMutation.error instanceof ApiError
      ? statusMutation.error.message
      : paymentMutation.error instanceof ApiError
        ? paymentMutation.error.message
        : null;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{order.customerName}&rsquo;s order</h1>
          <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
        </div>
        <div className="flex gap-2">
          {nextStatuses.map((status) => (
            <Button
              key={status}
              variant={status === "cancelled" ? "danger" : "primary"}
              onClick={() => statusMutation.mutate(status)}
              disabled={statusMutation.isPending}
            >
              Mark {status}
            </Button>
          ))}
        </div>
      </div>
      {mutationError ? <p className="text-sm text-red-600">{mutationError}</p> : null}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Contact & shipping</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-900">{order.customerEmail}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Phone</dt>
            <dd className="text-slate-900">{order.customerPhone}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-slate-500">Address</dt>
            <dd className="text-slate-900">
              {order.shippingAddressLine1}
              {order.shippingAddressLine2 ? `, ${order.shippingAddressLine2}` : ""}, {order.shippingCity}
              {order.shippingRegion ? `, ${order.shippingRegion}` : ""}
              {order.shippingPostalCode ? ` ${order.shippingPostalCode}` : ""}, {order.shippingCountry}
            </dd>
          </div>
          {order.customerNote ? (
            <div className="col-span-2">
              <dt className="text-slate-500">Note</dt>
              <dd className="text-slate-900">{order.customerNote}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Items</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="pb-2 font-medium">Product</th>
              <th className="pb-2 font-medium">SKU</th>
              <th className="pb-2 font-medium">Qty</th>
              <th className="pb-2 font-medium">Unit price</th>
              <th className="pb-2 font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item: OrderItem) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="py-2 text-slate-900">
                  {item.productNameSnapshot}
                  {item.variantSizeSnapshot || item.variantColorSnapshot ? (
                    <span className="text-slate-500">
                      {" "}
                      ({[item.variantSizeSnapshot, item.variantColorSnapshot].filter(Boolean).join(" / ")})
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-slate-500">{item.variantSkuSnapshot}</td>
                <td className="py-2 text-slate-900">{item.quantity}</td>
                <td className="py-2 text-slate-900">{formatMoney(item.unitPriceCents)}</td>
                <td className="py-2 text-slate-900">{formatMoney(item.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex justify-end border-t border-slate-100 pt-3 text-sm font-semibold text-slate-900">
          Total: {formatMoney(order.totalCents)}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Payment</h2>
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-slate-900">
              Cash on delivery &middot; {formatMoney(order.payment.amountCents)}
            </p>
            <Badge
              tone={
                order.payment.status === "collected"
                  ? "success"
                  : order.payment.status === "failed"
                    ? "danger"
                    : "warning"
              }
            >
              {order.payment.status}
            </Badge>
          </div>
          {order.payment.status === "pending" ? (
            <div className="flex gap-2">
              <Button onClick={() => paymentMutation.mutate("collected")} disabled={paymentMutation.isPending}>
                Mark collected
              </Button>
              <Button
                variant="danger"
                onClick={() => paymentMutation.mutate("failed")}
                disabled={paymentMutation.isPending}
              >
                Mark failed
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
