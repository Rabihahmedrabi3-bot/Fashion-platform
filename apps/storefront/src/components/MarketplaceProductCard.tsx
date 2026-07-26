import Link from "next/link";
import { Card } from "@fashion-platform/ui";
import type { MarketplaceProductSummary } from "@fashion-platform/shared-types";

export function MarketplaceProductCard({ product }: { product: MarketplaceProductSummary }) {
  return (
    <Link href={`/store/${product.storeSlug}/products/${product.slug}`}>
      <Card className="flex h-full flex-col gap-2">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="aspect-square w-full rounded object-cover" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400">
            No photo
          </div>
        )}
        <p className="text-sm font-medium text-slate-900">{product.name}</p>
        <p className="text-xs text-slate-500">{product.storeName}</p>
        <p className="text-sm text-slate-500">
          {product.priceCentsFrom !== null ? `From $${(product.priceCentsFrom / 100).toFixed(2)}` : "Price unavailable"}
        </p>
      </Card>
    </Link>
  );
}
