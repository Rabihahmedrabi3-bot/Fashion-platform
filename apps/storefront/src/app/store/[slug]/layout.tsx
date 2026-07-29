import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { getStore } from "../../../lib/api";
import { CartProvider } from "../../../lib/cart";
import { CustomerAuthProvider } from "../../../lib/customerAuth";
import { StorefrontHeader } from "../../../components/StorefrontHeader";

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStore(slug);
  if (!store) notFound();

  return (
    <CustomerAuthProvider storeSlug={slug}>
      <CartProvider storeSlug={slug}>
        <StorefrontHeader store={store} />
        <main
          className="mx-auto max-w-5xl px-6 py-8"
          style={
            {
              "--brand-accent": store.brandingSecondaryColor ?? store.brandingPrimaryColor ?? "#0f172a",
            } as CSSProperties
          }
        >
          {children}
        </main>
      </CartProvider>
    </CustomerAuthProvider>
  );
}
