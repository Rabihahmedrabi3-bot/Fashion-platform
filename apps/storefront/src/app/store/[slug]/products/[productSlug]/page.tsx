import { notFound } from "next/navigation";
import { AddToCartForm } from "../../../../../components/AddToCartForm";
import { getProduct } from "../../../../../lib/api";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;
  const product = await getProduct(slug, productSlug);
  if (!product) notFound();

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
      <div>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full rounded-lg object-cover" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
            No photo
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{product.name}</h1>
        {product.description ? <p className="text-sm text-slate-600">{product.description}</p> : null}
        <AddToCartForm product={product} />
      </div>
    </div>
  );
}
