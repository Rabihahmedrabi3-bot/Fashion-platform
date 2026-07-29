import Link from "next/link";
import { ProductCard } from "../../../../components/ProductCard";
import { listCategories, listProducts } from "../../../../lib/api";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ category?: string; collection?: string }>;
}) {
  const { slug } = await params;
  const { category, collection } = await searchParams;

  const [products, categories] = await Promise.all([
    listProducts(slug, { category, collection, limit: 48 }),
    listCategories(slug),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Shop</h1>

      {categories.length > 0 ? (
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/store/${slug}/products`}
            className={`rounded-full px-3 py-1 ${!category ? "bg-[var(--brand-accent,#0f172a)] text-white" : "bg-slate-100 text-slate-700"}`}
          >
            All
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/store/${slug}/products?category=${cat.slug}`}
              className={`rounded-full px-3 py-1 ${
                category === cat.slug ? "bg-[var(--brand-accent,#0f172a)] text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {cat.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {products.length === 0 ? (
        <p className="text-sm text-slate-500">No products found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} storeSlug={slug} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
