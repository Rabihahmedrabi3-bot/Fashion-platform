"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartItem {
  variantId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  priceCents: number;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  subtotalCents: number;
}

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(storeSlug: string): string {
  // Keyed per store, not globally - two different stores' carts must not merge.
  return `storefront_cart_${storeSlug}`;
}

export function CartProvider({ storeSlug, children }: { storeSlug: string; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(storeSlug));
    if (raw) {
      try {
        setItems(JSON.parse(raw) as CartItem[]);
      } catch {
        // Corrupted local storage - start fresh rather than crash the page.
      }
    }
    setHydrated(true);
  }, [storeSlug]);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(storageKey(storeSlug), JSON.stringify(items));
    }
  }, [items, storeSlug, hydrated]);

  function addItem(item: Omit<CartItem, "quantity">, quantity = 1): void {
    setItems((current) => {
      const existing = current.find((entry) => entry.variantId === item.variantId);
      if (existing) {
        return current.map((entry) =>
          entry.variantId === item.variantId ? { ...entry, quantity: entry.quantity + quantity } : entry,
        );
      }
      return [...current, { ...item, quantity }];
    });
  }

  function updateQuantity(variantId: string, quantity: number): void {
    setItems((current) =>
      quantity <= 0
        ? current.filter((entry) => entry.variantId !== variantId)
        : current.map((entry) => (entry.variantId === variantId ? { ...entry, quantity } : entry)),
    );
  }

  function removeItem(variantId: string): void {
    setItems((current) => current.filter((entry) => entry.variantId !== variantId));
  }

  const subtotalCents = useMemo(
    () => items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    [items],
  );

  const value: CartContextValue = { items, addItem, updateQuantity, removeItem, subtotalCents };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
