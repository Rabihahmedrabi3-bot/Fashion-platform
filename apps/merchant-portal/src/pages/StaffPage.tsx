import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, FormField, Input, Select, Table } from "@fashion-platform/ui";
import { ApiError, type MembershipListItem } from "@fashion-platform/api-client";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

export function StaffPage() {
  const { tenantId } = useTenantContext();
  const queryClient = useQueryClient();

  const membershipsQuery = useQuery({
    queryKey: ["memberships", tenantId],
    queryFn: () => apiClient.listMemberships(tenantId),
  });
  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiClient.listRoles(),
  });

  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("staff_basic");
  const [error, setError] = useState<string | null>(null);
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () => apiClient.inviteMembership(tenantId, { email, roleKey }),
    onSuccess: () => {
      setError(null);
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["memberships", tenantId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Something went wrong."),
  });

  const activateMutation = useMutation({
    mutationFn: (membershipId: string) => apiClient.updateMembership(tenantId, membershipId, { status: "active" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["memberships", tenantId] }),
  });

  const revokeMutation = useMutation({
    mutationFn: (membershipId: string) => apiClient.revokeMembership(tenantId, membershipId),
    onSuccess: () => {
      setConfirmingRevokeId(null);
      void queryClient.invalidateQueries({ queryKey: ["memberships", tenantId] });
    },
  });

  async function handleInvite(event: FormEvent): Promise<void> {
    event.preventDefault();
    await inviteMutation.mutateAsync();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Staff</h1>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Invite staff</h2>
        <p className="mb-3 text-sm text-slate-500">
          The person must already have a fashion-platform account (registered via the portal) before you can invite
          them.
        </p>
        <form onSubmit={(event) => void handleInvite(event)} className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <FormField label="Email" htmlFor="staffEmail">
            <Input
              id="staffEmail"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          <FormField label="Role" htmlFor="staffRole">
            <Select id="staffRole" value={roleKey} onChange={(event) => setRoleKey(event.target.value)}>
              {(rolesQuery.data ?? [])
                .filter((role) => role.key !== "super_admin")
                .map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.name}
                  </option>
                ))}
            </Select>
          </FormField>
          <div>
            {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? "Inviting…" : "Invite"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <Table
          columns={[
            { key: "user", header: "Name", render: (row: MembershipListItem) => row.userFullName },
            { key: "email", header: "Email", render: (row: MembershipListItem) => row.userEmail },
            { key: "role", header: "Role", render: (row: MembershipListItem) => row.roleKey },
            {
              key: "status",
              header: "Status",
              render: (row: MembershipListItem) => (
                <Badge tone={row.status === "active" ? "success" : row.status === "invited" ? "warning" : "danger"}>
                  {row.status}
                </Badge>
              ),
            },
            {
              key: "actions",
              header: "",
              render: (row: MembershipListItem) => (
                <div className="flex gap-3">
                  {row.status === "invited" ? (
                    <button
                      type="button"
                      onClick={() => activateMutation.mutate(row.id)}
                      className="text-sm text-slate-700 hover:underline"
                    >
                      Activate
                    </button>
                  ) : null}
                  {row.status !== "revoked" ? (
                    confirmingRevokeId === row.id ? (
                      <span className="flex items-center gap-2 text-sm">
                        Revoke?
                        <button
                          type="button"
                          onClick={() => revokeMutation.mutate(row.id)}
                          disabled={revokeMutation.isPending}
                          className="font-medium text-red-600 hover:underline"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRevokeId(null)}
                          className="text-slate-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingRevokeId(row.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Revoke
                      </button>
                    )
                  ) : null}
                </div>
              ),
            },
          ]}
          rows={membershipsQuery.data ?? []}
          getRowKey={(row) => row.id}
          emptyMessage={membershipsQuery.isLoading ? "Loading…" : "No staff yet — use \"Invite\" above to add one."}
        />
      </Card>
    </div>
  );
}
