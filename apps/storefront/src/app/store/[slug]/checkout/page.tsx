"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, FormField, Input } from "@fashion-platform/ui";
import { useCart } from "../../../../lib/cart";
import { useCustomerAuth } from "../../../../lib/customerAuth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { items, subtotalCents, clearCart } = useCart();
  const { customer, accessToken } = useCustomerAuth();

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Prefills once the logged-in customer loads (asynchronously, after this
  // component's first render) - a useState initializer alone would miss it.
  useEffect(() => {
    if (!customer) return;
    setCustomerName((current) => current || customer.fullName);
    setCustomerEmail((current) => current || customer.email);
    setCustomerPhone((current) => current || (customer.phone ?? ""));
  }, [customer]);
  const [shippingAddressLine1, setShippingAddressLine1] = useState("");
  const [shippingAddressLine2, setShippingAddressLine2] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingRegion, setShippingRegion] = useState("");
  const [shippingPostalCode, setShippingPostalCode] = useState("");
  const [shippingCountry, setShippingCountry] = useState("Lebanon");
  const [customerNote, setCustomerNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/public/stores/${slug}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerPhone,
          shippingAddressLine1,
          shippingAddressLine2: shippingAddressLine2 || undefined,
          shippingCity,
          shippingRegion: shippingRegion || undefined,
          shippingPostalCode: shippingPostalCode || undefined,
          shippingCountry,
          customerNote: customerNote || undefined,
          items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Could not place order.");
      }
      const order = (await res.json()) as { id: string };
      clearCart();
      router.push(`/store/${slug}/checkout/confirmation/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Checkout</h1>
      <Card>
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <FormField label="Full name" htmlFor="customerName">
            <Input
              id="customerName"
              required
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </FormField>
          <FormField label="Email" htmlFor="customerEmail">
            <Input
              id="customerEmail"
              type="email"
              required
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
            />
          </FormField>
          <FormField label="Phone" htmlFor="customerPhone">
            <Input
              id="customerPhone"
              required
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
            />
          </FormField>
          <FormField label="Address" htmlFor="shippingAddressLine1">
            <Input
              id="shippingAddressLine1"
              required
              value={shippingAddressLine1}
              onChange={(event) => setShippingAddressLine1(event.target.value)}
            />
          </FormField>
          <FormField label="Address line 2 (optional)" htmlFor="shippingAddressLine2">
            <Input
              id="shippingAddressLine2"
              value={shippingAddressLine2}
              onChange={(event) => setShippingAddressLine2(event.target.value)}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="City" htmlFor="shippingCity">
              <Input
                id="shippingCity"
                required
                value={shippingCity}
                onChange={(event) => setShippingCity(event.target.value)}
              />
            </FormField>
            <FormField label="Region (optional)" htmlFor="shippingRegion">
              <Input
                id="shippingRegion"
                value={shippingRegion}
                onChange={(event) => setShippingRegion(event.target.value)}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Postal code (optional)" htmlFor="shippingPostalCode">
              <Input
                id="shippingPostalCode"
                value={shippingPostalCode}
                onChange={(event) => setShippingPostalCode(event.target.value)}
              />
            </FormField>
            <FormField label="Country" htmlFor="shippingCountry">
              <Input
                id="shippingCountry"
                required
                value={shippingCountry}
                onChange={(event) => setShippingCountry(event.target.value)}
              />
            </FormField>
          </div>
          <FormField label="Order note (optional)" htmlFor="customerNote">
            <Input id="customerNote" value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} />
          </FormField>

          <Card className="flex items-center justify-between bg-slate-50">
            <span className="text-sm font-medium text-slate-700">Total (cash on delivery)</span>
            <span className="text-lg font-semibold text-slate-900">${(subtotalCents / 100).toFixed(2)}</span>
          </Card>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Placing order…" : "Place order"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
