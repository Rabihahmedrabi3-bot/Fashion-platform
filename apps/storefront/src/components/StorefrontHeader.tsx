"use client";

import Link from "next/link";
import type { PublicStoreResponse } from "@fashion-platform/shared-types";
import { useCart } from "../lib/cart";

export function StorefrontHeader({ store }: { store: PublicStoreResponse }) {
  const { items } = useCart();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header
      className="flex items-center justify-between px-6 py-4 text-white"
      style={{ backgroundColor: store.brandingPrimaryColor ?? "#0f172a" }}
    >
      <Link href={`/store/${store.slug}`} className="flex items-center gap-2 font-semibold">
        {store.brandingLogoUrl ? (
          <img src={store.brandingLogoUrl} alt={store.name} className="h-8 w-8 rounded object-cover" />
        ) : null}
        {store.name}
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href={`/store/${store.slug}/products`}>Shop</Link>
        <Link href={`/store/${store.slug}/cart`}>Cart ({itemCount})</Link>
      </nav>
    </header>
  );
}
