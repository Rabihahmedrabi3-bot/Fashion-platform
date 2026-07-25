import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@fashion-platform/ui";
import { apiClient } from "../lib/apiClient";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => apiClient.adminGetSettings(),
  });

  const [tenantRegistrationOpen, setTenantRegistrationOpen] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setTenantRegistrationOpen(settingsQuery.data.tenantRegistrationOpen);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.adminUpdateSettings({ tenantRegistrationOpen }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });

  if (settingsQuery.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Platform Settings</h1>
      <Card>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <input
            type="checkbox"
            checked={tenantRegistrationOpen}
            onChange={(event) => {
              setTenantRegistrationOpen(event.target.checked);
              setSaved(false);
            }}
          />
          New store registration is open
        </label>
        <p className="mt-2 text-sm text-slate-500">
          When closed, store owners can no longer create new stores through the Merchant Portal - existing stores
          are unaffected.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
          {saved ? <span className="text-sm text-green-700">Saved.</span> : null}
        </div>
      </Card>
    </div>
  );
}
