import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Table } from "@fashion-platform/ui";
import type { TenantStatus } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
}

const STATUS_TONE: Record<TenantStatus, "neutral" | "success" | "warning" | "danger"> = {
  pending_approval: "warning",
  active: "success",
  suspended: "danger",
  rejected: "danger",
};

const STATUS_OPTIONS: Array<TenantStatus | "all"> = ["all", "pending_approval", "active", "suspended", "rejected"];

export function TenantsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TenantStatus | "all">("pending_approval");
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});

  const tenantsQuery = useQuery({
    queryKey: ["admin", "tenants", statusFilter],
    queryFn: () => apiClient.adminListTenants(statusFilter === "all" ? undefined : statusFilter),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
  }

  const approveMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.adminApproveTenant(tenantId),
    onSuccess: invalidate,
  });
  const rejectMutation = useMutation({
    mutationFn: ({ tenantId, reason }: { tenantId: string; reason: string }) =>
      apiClient.adminRejectTenant(tenantId, reason ? { reason } : {}),
    onSuccess: invalidate,
  });
  const suspendMutation = useMutation({
    mutationFn: ({ tenantId, reason }: { tenantId: string; reason: string }) =>
      apiClient.adminSuspendTenant(tenantId, reason ? { reason } : {}),
    onSuccess: invalidate,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Tenants</h1>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as TenantStatus | "all")}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All statuses" : option}
            </option>
          ))}
        </select>
      </div>
      <Card>
        <Table
          columns={[
            { key: "name", header: "Name", render: (row: TenantRow) => row.name },
            { key: "slug", header: "Slug", render: (row: TenantRow) => row.slug },
            {
              key: "status",
              header: "Status",
              render: (row: TenantRow) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>,
            },
            {
              key: "actions",
              header: "",
              render: (row: TenantRow) => {
                if (row.status === "pending_approval") {
                  return (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => approveMutation.mutate(row.id)}
                        disabled={approveMutation.isPending}
                      >
                        Approve
                      </Button>
                      <input
                        placeholder="Reason (optional)"
                        value={reasonDrafts[row.id] ?? ""}
                        onChange={(event) =>
                          setReasonDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                        }
                        className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <Button
                        variant="danger"
                        onClick={() =>
                          rejectMutation.mutate({ tenantId: row.id, reason: reasonDrafts[row.id] ?? "" })
                        }
                        disabled={rejectMutation.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  );
                }
                if (row.status === "active") {
                  return (
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="Reason (optional)"
                        value={reasonDrafts[row.id] ?? ""}
                        onChange={(event) =>
                          setReasonDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                        }
                        className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <Button
                        variant="danger"
                        onClick={() =>
                          suspendMutation.mutate({ tenantId: row.id, reason: reasonDrafts[row.id] ?? "" })
                        }
                        disabled={suspendMutation.isPending}
                      >
                        Suspend
                      </Button>
                    </div>
                  );
                }
                return null;
              },
            },
          ]}
          rows={(tenantsQuery.data ?? []) as TenantRow[]}
          getRowKey={(row) => row.id}
          emptyMessage={tenantsQuery.isLoading ? "Loading…" : "No tenants match this filter."}
        />
      </Card>
    </div>
  );
}
