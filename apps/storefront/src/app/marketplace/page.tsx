import { MarketplaceProductCard } from "../../components/MarketplaceProductCard";
import { listMarketplaceProducts } from "../../lib/api";

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; aiQuery?: string }>;
}) {
  const { search, aiQuery } = await searchParams;
  const products = await listMarketplaceProducts({ search, aiQuery, limit: 48 });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Marketplace</h1>
          <p className="mt-1 text-sm text-slate-500">Browse products across every store that has opted in.</p>
        </div>

        <form method="get" className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search ?? ""}
            placeholder="Search products…"
            className="w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Search
          </button>
        </form>

        <form method="get" className="flex gap-2">
          <input
            type="text"
            name="aiQuery"
            defaultValue={aiQuery ?? ""}
            placeholder="Ask AI: e.g. red dress for a wedding under $50"
            className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Ask AI
          </button>
        </form>

        {products.length === 0 ? (
          <p className="text-sm text-slate-500">No products found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {products.map((product) => (
              <MarketplaceProductCard key={`${product.storeSlug}-${product.id}`} product={product} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
