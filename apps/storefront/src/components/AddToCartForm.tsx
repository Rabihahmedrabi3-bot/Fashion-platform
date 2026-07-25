"use client";

import { useState } from "react";
import { Button } from "@fashion-platform/ui";
import type { PublicProductDetail } from "@fashion-platform/shared-types";
import { useCart } from "../lib/cart";

export function AddToCartForm({ product }: { product: PublicProductDetail }) {
  const { addItem } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [added, setAdded] = useState(false);

  if (product.variants.length === 0) {
    return <p className="text-sm text-slate-500">This product is currently unavailable.</p>;
  }

  const selectedVariant = product.variants.find((variant) => variant.id === variantId);

  function handleAddToCart(): void {
    if (!selectedVariant) return;
    const label =
      [selectedVariant.size, selectedVariant.color].filter(Boolean).join(" / ") || selectedVariant.sku;
    addItem({
      variantId: selectedVariant.id,
      productSlug: product.slug,
      productName: product.name,
      variantLabel: label,
      priceCents: selectedVariant.priceCents,
    });
    setAdded(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="variant" className="mb-1 block text-sm font-medium text-slate-700">
          Options
        </label>
        <select
          id="variant"
          value={variantId}
          onChange={(event) => {
            setVariantId(event.target.value);
            setAdded(false);
          }}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          {product.variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {[variant.size, variant.color].filter(Boolean).join(" / ") || variant.sku} - $
              {(variant.priceCents / 100).toFixed(2)}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" onClick={handleAddToCart}>
        Add to cart
      </Button>
      {added ? <p className="text-sm text-green-700">Added to cart.</p> : null}
    </div>
  );
}
