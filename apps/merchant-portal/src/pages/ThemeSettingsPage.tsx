import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, FormField, Input } from "@fashion-platform/ui";
import { ApiError } from "@fashion-platform/api-client";
import type { ThemeConfig } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

const DEFAULT_THEME: ThemeConfig = { hero: { title: "" } };

export function ThemeSettingsPage() {
  const { tenantId } = useTenantContext();
  const queryClient = useQueryClient();

  const storeQuery = useQuery({
    queryKey: ["store", tenantId],
    queryFn: () => apiClient.getStore(tenantId),
  });
  const collectionsQuery = useQuery({
    queryKey: ["collections", tenantId],
    queryFn: () => apiClient.listCollections(tenantId),
  });

  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (storeQuery.data) {
      setTheme(storeQuery.data.brandingThemeConfig);
    }
  }, [storeQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.updateStore(tenantId, { brandingThemeConfig: theme }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["store", tenantId] });
    },
    onError: (err) => {
      setSaved(false);
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    },
  });

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaved(false);
    await saveMutation.mutateAsync();
  }

  const [heroImageError, setHeroImageError] = useState<string | null>(null);

  const uploadHeroImageMutation = useMutation({
    mutationFn: (file: File) => apiClient.uploadThemeHeroImage(tenantId, file),
    onSuccess: (updatedStore) => {
      setHeroImageError(null);
      setTheme((t) => ({ ...t, hero: { ...t.hero, imageUrl: updatedStore.brandingThemeConfig.hero.imageUrl } }));
      void queryClient.invalidateQueries({ queryKey: ["store", tenantId] });
    },
    onError: (err) => setHeroImageError(err instanceof ApiError ? err.message : "Could not upload image."),
  });

  function handleHeroImageChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) uploadHeroImageMutation.mutate(file);
    event.target.value = "";
  }

  const banner = theme.banner ?? { enabled: false };
  const featuredCollection = theme.featuredCollection ?? { enabled: false };
  const productGrid = theme.productGrid ?? { enabled: false };
  const brandInfo = theme.brandInfo ?? { enabled: false };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Storefront Theme</h1>
      <p className="text-sm text-slate-500">
        Configure the sections your public storefront homepage shows, in this fixed order: hero, banner, featured
        collection, product grid, brand info.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Hero (always shown)</h2>
          <div className="flex flex-col gap-4">
            <FormField label="Title" htmlFor="heroTitle">
              <Input
                id="heroTitle"
                required
                value={theme.hero.title}
                onChange={(event) =>
                  setTheme((t) => ({ ...t, hero: { ...t.hero, title: event.target.value } }))
                }
              />
            </FormField>
            <FormField label="Subtitle" htmlFor="heroSubtitle">
              <Input
                id="heroSubtitle"
                value={theme.hero.subtitle ?? ""}
                onChange={(event) =>
                  setTheme((t) => ({ ...t, hero: { ...t.hero, subtitle: event.target.value || undefined } }))
                }
              />
            </FormField>
            <FormField label="Image" htmlFor="heroImage">
              <div className="flex items-center gap-4">
                {theme.hero.imageUrl ? (
                  <img
                    src={theme.hero.imageUrl}
                    alt="Hero"
                    className="h-20 w-32 rounded-md border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-32 items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-400">
                    No image
                  </div>
                )}
                <div>
                  <input
                    id="heroImage"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleHeroImageChange}
                    disabled={uploadHeroImageMutation.isPending}
                    className="text-sm text-slate-700"
                  />
                  {uploadHeroImageMutation.isPending ? (
                    <p className="mt-1 text-xs text-slate-500">Uploading…</p>
                  ) : null}
                  {heroImageError ? <p className="mt-1 text-sm text-red-600">{heroImageError}</p> : null}
                </div>
              </div>
            </FormField>
          </div>
        </Card>

        <Card>
          <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <input
              type="checkbox"
              checked={banner.enabled}
              onChange={(event) => setTheme((t) => ({ ...t, banner: { ...banner, enabled: event.target.checked } }))}
            />
            Banner
          </label>
          {banner.enabled ? (
            <div className="flex flex-col gap-4">
              <FormField label="Message" htmlFor="bannerMessage">
                <Input
                  id="bannerMessage"
                  value={banner.message ?? ""}
                  onChange={(event) =>
                    setTheme((t) => ({ ...t, banner: { ...banner, message: event.target.value || undefined } }))
                  }
                />
              </FormField>
              <FormField label="Link URL" htmlFor="bannerLink">
                <Input
                  id="bannerLink"
                  value={banner.linkUrl ?? ""}
                  onChange={(event) =>
                    setTheme((t) => ({ ...t, banner: { ...banner, linkUrl: event.target.value || undefined } }))
                  }
                />
              </FormField>
            </div>
          ) : null}
        </Card>

        <Card>
          <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <input
              type="checkbox"
              checked={featuredCollection.enabled}
              onChange={(event) =>
                setTheme((t) => ({ ...t, featuredCollection: { ...featuredCollection, enabled: event.target.checked } }))
              }
            />
            Featured collection
          </label>
          {featuredCollection.enabled ? (
            <FormField label="Collection" htmlFor="featuredCollectionSlug">
              <select
                id="featuredCollectionSlug"
                value={featuredCollection.collectionSlug ?? ""}
                onChange={(event) =>
                  setTheme((t) => ({
                    ...t,
                    featuredCollection: { ...featuredCollection, collectionSlug: event.target.value || undefined },
                  }))
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">Choose a collection…</option>
                {(collectionsQuery.data ?? []).map((collection) => (
                  <option key={collection.id} value={collection.slug}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
        </Card>

        <Card>
          <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <input
              type="checkbox"
              checked={productGrid.enabled}
              onChange={(event) =>
                setTheme((t) => ({ ...t, productGrid: { ...productGrid, enabled: event.target.checked } }))
              }
            />
            Product grid
          </label>
          {productGrid.enabled ? (
            <div className="flex flex-col gap-4">
              <FormField label="Title" htmlFor="productGridTitle">
                <Input
                  id="productGridTitle"
                  value={productGrid.title ?? ""}
                  onChange={(event) =>
                    setTheme((t) => ({ ...t, productGrid: { ...productGrid, title: event.target.value || undefined } }))
                  }
                />
              </FormField>
              <FormField label="Max items" htmlFor="productGridLimit">
                <Input
                  id="productGridLimit"
                  type="number"
                  min={1}
                  max={50}
                  value={productGrid.limit ?? ""}
                  onChange={(event) =>
                    setTheme((t) => ({
                      ...t,
                      productGrid: {
                        ...productGrid,
                        limit: event.target.value ? Number(event.target.value) : undefined,
                      },
                    }))
                  }
                />
              </FormField>
            </div>
          ) : null}
        </Card>

        <Card>
          <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <input
              type="checkbox"
              checked={brandInfo.enabled}
              onChange={(event) =>
                setTheme((t) => ({ ...t, brandInfo: { ...brandInfo, enabled: event.target.checked } }))
              }
            />
            Brand info
          </label>
          {brandInfo.enabled ? (
            <div className="flex flex-col gap-4">
              <FormField label="Heading" htmlFor="brandHeading">
                <Input
                  id="brandHeading"
                  value={brandInfo.heading ?? ""}
                  onChange={(event) =>
                    setTheme((t) => ({ ...t, brandInfo: { ...brandInfo, heading: event.target.value || undefined } }))
                  }
                />
              </FormField>
              <FormField label="Body" htmlFor="brandBody">
                <Input
                  id="brandBody"
                  value={brandInfo.body ?? ""}
                  onChange={(event) =>
                    setTheme((t) => ({ ...t, brandInfo: { ...brandInfo, body: event.target.value || undefined } }))
                  }
                />
              </FormField>
            </div>
          ) : null}
        </Card>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {saved ? <p className="text-sm text-green-700">Saved.</p> : null}
        <Button type="submit" disabled={saveMutation.isPending} className="self-start">
          {saveMutation.isPending ? "Saving…" : "Save theme"}
        </Button>
      </form>
    </div>
  );
}
