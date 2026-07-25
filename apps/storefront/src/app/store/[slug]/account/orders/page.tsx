"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card } from "@fashion-platform/ui";
import type { OrderListItem } from "@fashion-platform/shared-types";
import { useCustomerAuth } from "../../../../../lib/customerAuth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function AccountOrdersPage() {
  const { slug } = useParams<{ slug: string }>();
  const { status, accessToken } = useCustomerAuth();
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken) return;
    let cancelled = false;
    fetch(`${API_BASE_URL}/public/stores/${slug}/customers/me/orders`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => (res.ok ? (res.json() as Promise<OrderListItem[]>) : Promise.reject(new Error("failed"))))
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [status, accessToken, slug]);

  if (status === "loading") {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-slate-600">Log in to see your order history.</p>
        <Link href={`/store/${slug}/account/login`} className="text-sm underline">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">Your orders</h1>
      {orders === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-slate-500">You haven&rsquo;t placed any orders yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <Card key={order.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">
                  {order.itemCount} item{order.itemCount === 1 ? "" : "s"} &middot; $
                  {(order.totalCents / 100).toFixed(2)}
                </p>
                <p className="text-sm text-slate-500">{new Date(order.createdAt).toLocaleString()}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {order.status}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
