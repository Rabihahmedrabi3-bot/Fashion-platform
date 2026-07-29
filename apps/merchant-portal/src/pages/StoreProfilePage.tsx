import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, FormField, Input } from "@fashion-platform/ui";
import { ApiError } from "@fashion-platform/api-client";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

export function StoreProfilePage() {
  const { tenantId } = useTenantContext();
  const queryClient = useQueryClient();
  const storeQuery = useQuery({
    queryKey: ["store", tenantId],
    queryFn: () => apiClient.getStore(tenantId),
  });

  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [marketplaceEligible, setMarketplaceEligible] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);

  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappError, setWhatsappError] = useState<string | null>(null);

  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (storeQuery.data) {
      setPrimaryColor(storeQuery.data.brandingPrimaryColor ?? "");
      setSecondaryColor(storeQuery.data.brandingSecondaryColor ?? "");
      setMarketplaceEligible(storeQuery.data.marketplaceEligible);
      setWhatsappNumber(storeQuery.data.whatsappNumber ?? "");
    }
  }, [storeQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.updateStore(tenantId, {
        brandingPrimaryColor: primaryColor || null,
        brandingSecondaryColor: secondaryColor || null,
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["store", tenantId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Something went wrong."),
  });

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await updateMutation.mutateAsync();
  }

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => apiClient.uploadStoreLogo(tenantId, file),
    onSuccess: () => {
      setLogoError(null);
      void queryClient.invalidateQueries({ queryKey: ["store", tenantId] });
    },
    onError: (err) => setLogoError(err instanceof ApiError ? err.message : "Could not upload logo."),
  });

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) uploadLogoMutation.mutate(file);
    event.target.value = "";
  }

  const marketplaceMutation = useMutation({
    mutationFn: (nextValue: boolean) => apiClient.updateStore(tenantId, { marketplaceEligible: nextValue }),
    onSuccess: () => {
      setMarketplaceError(null);
      void queryClient.invalidateQueries({ queryKey: ["store", tenantId] });
    },
    onError: (err) => setMarketplaceError(err instanceof ApiError ? err.message : "Something went wrong."),
  });

  async function handleMarketplaceSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await marketplaceMutation.mutateAsync(marketplaceEligible);
  }

  const whatsappMutation = useMutation({
    mutationFn: () => apiClient.updateStore(tenantId, { whatsappNumber: whatsappNumber || null }),
    onSuccess: () => {
      setWhatsappError(null);
      void queryClient.invalidateQueries({ queryKey: ["store", tenantId] });
    },
    onError: (err) => setWhatsappError(err instanceof ApiError ? err.message : "Something went wrong."),
  });

  async function handleWhatsappSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await whatsappMutation.mutateAsync();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Store Profile</h1>
      <Card>
        <p className="text-sm text-slate-500">Name</p>
        <p className="text-slate-900">{storeQuery.data?.name ?? "…"}</p>
        <p className="mt-3 text-sm text-slate-500">Status</p>
        <p className="text-slate-900">{storeQuery.data?.status ?? "…"}</p>
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Logo</h2>
        <div className="flex items-center gap-4">
          {storeQuery.data?.brandingLogoUrl ? (
            <img
              src={storeQuery.data.brandingLogoUrl}
              alt="Store logo"
              className="h-24 w-24 rounded-md border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-400">
              No logo
            </div>
          )}
          <div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleLogoChange}
              disabled={uploadLogoMutation.isPending}
              className="text-sm text-slate-700"
            />
            {uploadLogoMutation.isPending ? <p className="mt-1 text-xs text-slate-500">Uploading…</p> : null}
            {logoError ? <p className="mt-1 text-sm text-red-600">{logoError}</p> : null}
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Branding</h2>
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <FormField label="Primary color (hex)" htmlFor="primaryColor">
            <Input
              id="primaryColor"
              value={primaryColor}
              onChange={(event) => setPrimaryColor(event.target.value)}
              placeholder="#112233"
            />
          </FormField>
          <FormField label="Secondary color (hex)" htmlFor="secondaryColor">
            <Input
              id="secondaryColor"
              value={secondaryColor}
              onChange={(event) => setSecondaryColor(event.target.value)}
              placeholder="#445566"
            />
          </FormField>
          <p className="text-xs text-slate-500">
            Primary colors the storefront header. Secondary is used for buttons and calls to action — if left
            blank, the primary color is used for both.
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={updateMutation.isPending} className="self-start">
            {updateMutation.isPending ? "Saving…" : "Save branding"}
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Marketplace</h2>
        <form onSubmit={(event) => void handleMarketplaceSubmit(event)} className="flex flex-col gap-4">
          <label htmlFor="marketplaceEligible" className="flex items-start gap-2 text-sm text-slate-700">
            <input
              id="marketplaceEligible"
              type="checkbox"
              checked={marketplaceEligible}
              onChange={(event) => setMarketplaceEligible(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              List this store in the marketplace once it launches. This only records your preference for now —
              cross-store browsing and search aren&apos;t built yet.
            </span>
          </label>
          {marketplaceError ? <p className="text-sm text-red-600">{marketplaceError}</p> : null}
          <Button type="submit" disabled={marketplaceMutation.isPending} className="self-start">
            {marketplaceMutation.isPending ? "Saving…" : "Save marketplace preference"}
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">WhatsApp</h2>
        <form onSubmit={(event) => void handleWhatsappSubmit(event)} className="flex flex-col gap-4">
          <FormField label="WhatsApp number" htmlFor="whatsappNumber">
            <Input
              id="whatsappNumber"
              value={whatsappNumber}
              onChange={(event) => setWhatsappNumber(event.target.value)}
              placeholder="+9611234567"
            />
          </FormField>
          <p className="text-xs text-slate-500">
            Shown to customers after checkout as a one-click link to send you their order details on WhatsApp.
            Include the country code (e.g. +961…). Leave blank to hide this option.
          </p>
          {whatsappError ? <p className="text-sm text-red-600">{whatsappError}</p> : null}
          <Button type="submit" disabled={whatsappMutation.isPending} className="self-start">
            {whatsappMutation.isPending ? "Saving…" : "Save WhatsApp number"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
