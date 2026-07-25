import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, FormField, Input, Table } from "@fashion-platform/ui";
import type { AuditLog } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";

export function AuditLogsPage() {
  const [tenantId, setTenantId] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const auditLogsQuery = useQuery({
    queryKey: ["admin", "audit-logs", tenantId, actorUserId, from, to],
    queryFn: () =>
      apiClient.adminListAuditLogs({
        tenantId: tenantId || undefined,
        actorUserId: actorUserId || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      }),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Audit Logs</h1>
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FormField label="Tenant ID (optional)" htmlFor="tenantId">
            <Input id="tenantId" value={tenantId} onChange={(event) => setTenantId(event.target.value)} />
          </FormField>
          <FormField label="Actor user ID (optional)" htmlFor="actorUserId">
            <Input id="actorUserId" value={actorUserId} onChange={(event) => setActorUserId(event.target.value)} />
          </FormField>
          <FormField label="From (optional)" htmlFor="from">
            <Input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </FormField>
          <FormField label="To (optional)" htmlFor="to">
            <Input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </FormField>
        </div>
      </Card>
      <Card>
        <Table
          columns={[
            {
              key: "createdAt",
              header: "When",
              render: (row: AuditLog) => new Date(row.createdAt).toLocaleString(),
            },
            { key: "action", header: "Action", render: (row: AuditLog) => row.action },
            { key: "targetType", header: "Target type", render: (row: AuditLog) => row.targetType },
            { key: "targetId", header: "Target ID", render: (row: AuditLog) => row.targetId },
            { key: "tenantId", header: "Tenant ID", render: (row: AuditLog) => row.tenantId ?? "—" },
            { key: "actorUserId", header: "Actor", render: (row: AuditLog) => row.actorUserId ?? "system" },
          ]}
          rows={auditLogsQuery.data ?? []}
          getRowKey={(row) => row.id}
          emptyMessage={auditLogsQuery.isLoading ? "Loading…" : "No audit log entries match this filter."}
        />
      </Card>
    </div>
  );
}
