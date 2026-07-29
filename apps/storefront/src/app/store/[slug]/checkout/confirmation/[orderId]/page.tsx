import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@fashion-platform/ui";
import type { OrderItem, OrderWithDetails } from "@fashion-platform/shared-types";
import { getStore } from "../../../../../../lib/api";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

async function getOrder(slug: string, orderId: string): Promise<OrderWithDetails | null> {
  const res = await fetch(`${API_BASE_URL}/public/stores/${slug}/orders/${orderId}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request failed with ${res.status}`);
  return (await res.json()) as OrderWithDetails;
}

function buildWhatsappLink(whatsappNumber: string, storeName: string, order: OrderWithDetails): string {
  const lines = [
    `New order from ${order.customerName} for ${storeName}`,
    "",
    ...order.items.map((item: OrderItem) => {
      const variant = [item.variantSizeSnapshot, item.variantColorSnapshot].filter(Boolean).join("/");
      return `- ${item.productNameSnapshot}${variant ? ` (${variant})` : ""} x${item.quantity} - $${(item.lineTotalCents / 100).toFixed(2)}`;
    }),
    "",
    `Total: $${(order.totalCents / 100).toFixed(2)}`,
    "",
    `Customer: ${order.customerName} (${order.customerPhone})`,
    `Ship to: ${order.shippingAddressLine1}${order.shippingAddressLine2 ? `, ${order.shippingAddressLine2}` : ""}, ${order.shippingCity}${order.shippingRegion ? `, ${order.shippingRegion}` : ""}${order.shippingPostalCode ? ` ${order.shippingPostalCode}` : ""}, ${order.shippingCountry}`,
  ];
  const digitsOnly = whatsappNumber.replace(/[^0-9]/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const [order, store] = await Promise.all([getOrder(slug, orderId), getStore(slug)]);
  if (!order) notFound();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Order confirmed</h1>
        <p className="mt-1 text-sm text-slate-500">
          We&rsquo;ve sent a confirmation to {order.customerEmail}. Pay by cash on delivery.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Items</h2>
        <div className="flex flex-col gap-2">
          {order.items.map((item: OrderItem) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-900">
                {item.productNameSnapshot}
                {item.variantSizeSnapshot || item.variantColorSnapshot ? (
                  <span className="text-slate-500">
                    {" "}
                    ({[item.variantSizeSnapshot, item.variantColorSnapshot].filter(Boolean).join(" / ")})
                  </span>
                ) : null}{" "}
                &times; {item.quantity}
              </span>
              <span className="text-slate-900">${(item.lineTotalCents / 100).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-slate-900">
          <span>Total</span>
          <span>${(order.totalCents / 100).toFixed(2)}</span>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Shipping to</h2>
        <p className="text-sm text-slate-600">
          {order.customerName}
          <br />
          {order.shippingAddressLine1}
          {order.shippingAddressLine2 ? `, ${order.shippingAddressLine2}` : ""}
          <br />
          {order.shippingCity}
          {order.shippingRegion ? `, ${order.shippingRegion}` : ""}
          {order.shippingPostalCode ? ` ${order.shippingPostalCode}` : ""}
          <br />
          {order.shippingCountry}
        </p>
      </Card>

      {store?.whatsappNumber ? (
        <a
          href={buildWhatsappLink(store.whatsappNumber, store.name, order)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-[#25D366] px-4 py-2 text-center text-sm font-medium text-white hover:opacity-90"
        >
          Send order to {store.name} on WhatsApp
        </a>
      ) : null}

      <Link href={`/store/${slug}/products`} className="text-center text-sm underline">
        Continue shopping
      </Link>
    </div>
  );
}
