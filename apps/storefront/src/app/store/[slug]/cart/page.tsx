"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@fashion-platform/ui";
import { useCart } from "../../../../lib/cart";

export default function CartPage() {
  const { slug } = useParams<{ slug: string }>();
  const { items, updateQuantity, removeItem, subtotalCents } = useCart();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-slate-500">Your cart is empty.</p>
        <Link href={`/store/${slug}/products`}>
          <Button>Continue shopping</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Your Cart</h1>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <Card key={item.variantId} className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-slate-900">{item.productName}</p>
              <p className="text-sm text-slate-500">{item.variantLabel}</p>
              <p className="text-sm text-slate-500">${(item.priceCents / 100).toFixed(2)} each</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={item.quantity}
                onChange={(event) => updateQuantity(item.variantId, Number(event.target.value))}
                className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeItem(item.variantId)}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          </Card>
        ))}
      </div>
      <Card className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Subtotal</span>
        <span className="text-lg font-semibold text-slate-900">${(subtotalCents / 100).toFixed(2)}</span>
      </Card>
      <p className="text-sm text-slate-500">
        Checkout isn&apos;t available yet - it&apos;s coming in a future release.
      </p>
    </div>
  );
}
