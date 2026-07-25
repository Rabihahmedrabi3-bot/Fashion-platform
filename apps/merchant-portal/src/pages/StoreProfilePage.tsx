import { useEffect, useState, type FormEvent } from "react";
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

  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (storeQuery.data) {
      setLogoUrl(storeQuery.data.brandingLogoUrl ?? "");
      setPrimaryColor(storeQuery.data.brandingPrimaryColor ?? "");
    }
  }, [storeQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.updateStore(tenantId, {
        brandingLogoUrl: logoUrl || null,
        brandingPrimaryColor: primaryColor || null,
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
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Branding</h2>
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <FormField label="Logo URL" htmlFor="logoUrl">
            <Input
              id="logoUrl"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://…"
            />
          </FormField>
          <FormField label="Primary color (hex)" htmlFor="primaryColor">
            <Input
              id="primaryColor"
              value={primaryColor}
              onChange={(event) => setPrimaryColor(event.target.value)}
              placeholder="#112233"
            />
          </FormField>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={updateMutation.isPending} className="self-start">
            {updateMutation.isPending ? "Saving…" : "Save branding"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
