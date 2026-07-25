import Link from "next/link";
import { Button } from "@fashion-platform/ui";
import { ProductCard } from "../../../components/ProductCard";
import { getStore, listProducts } from "../../../lib/api";

export default async function StoreHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  if (!store) return null; // the parent layout already calls notFound()

  const theme = store.brandingThemeConfig;

  const [featuredProducts, gridProducts] = await Promise.all([
    theme.featuredCollection?.enabled && theme.featuredCollection.collectionSlug
      ? listProducts(slug, { collection: theme.featuredCollection.collectionSlug, limit: 8 })
      : Promise.resolve([]),
    theme.productGrid?.enabled ? listProducts(slug, { limit: theme.productGrid.limit ?? 12 }) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section
        className="flex flex-col items-center gap-3 rounded-lg bg-slate-100 bg-cover bg-center px-6 py-16 text-center"
        style={theme.hero.imageUrl ? { backgroundImage: `url(${theme.hero.imageUrl})` } : undefined}
      >
        <h1 className="text-3xl font-bold text-slate-900">{theme.hero.title}</h1>
        {theme.hero.subtitle ? <p className="max-w-xl text-slate-600">{theme.hero.subtitle}</p> : null}
        <Link href={`/store/${slug}/products`}>
          <Button>Shop now</Button>
        </Link>
      </section>

      {theme.banner?.enabled && theme.banner.message ? (
        <section className="rounded-lg bg-amber-50 px-6 py-4 text-center text-sm text-amber-800">
          {theme.banner.linkUrl ? (
            <a href={theme.banner.linkUrl} className="underline">
              {theme.banner.message}
            </a>
          ) : (
            theme.banner.message
          )}
        </section>
      ) : null}

      {theme.featuredCollection?.enabled && featuredProducts.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Featured</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} storeSlug={slug} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {theme.productGrid?.enabled && gridProducts.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-slate-900">{theme.productGrid.title ?? "Products"}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {gridProducts.map((product) => (
              <ProductCard key={product.id} storeSlug={slug} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {theme.brandInfo?.enabled && (theme.brandInfo.heading ?? theme.brandInfo.body) ? (
        <section className="rounded-lg border border-slate-200 px-6 py-8 text-center">
          {theme.brandInfo.heading ? (
            <h2 className="text-lg font-semibold text-slate-900">{theme.brandInfo.heading}</h2>
          ) : null}
          {theme.brandInfo.body ? <p className="mt-2 text-sm text-slate-600">{theme.brandInfo.body}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
