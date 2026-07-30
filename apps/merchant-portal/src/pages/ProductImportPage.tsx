import { useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Badge, Button, Card, Table } from "@fashion-platform/ui";
import { ApiError } from "@fashion-platform/api-client";
import type { ProductImportRowResult } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

export function ProductImportPage() {
  const { tenantId } = useTenantContext();
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [results, setResults] = useState<ProductImportRowResult[] | null>(null);

  const downloadTemplateMutation = useMutation({
    mutationFn: () => apiClient.downloadProductImportTemplate(tenantId),
    onSuccess: (blob) => {
      setTemplateError(null);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "product-import-template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (err) => setTemplateError(err instanceof ApiError ? err.message : "Could not download template."),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => apiClient.importProducts(tenantId, file),
    onSuccess: (data) => {
      setImportError(null);
      setResults(data.results);
    },
    onError: (err) => setImportError(err instanceof ApiError ? err.message : "Import failed."),
  });

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) importMutation.mutate(file);
    event.target.value = "";
  }

  const createdCount = results?.filter((row) => row.status === "created").length ?? 0;
  const errorCount = results?.filter((row) => row.status === "error").length ?? 0;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Import products</h1>
        <Link to="/products">
          <Button variant="secondary">Back to products</Button>
        </Link>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">1. Download the template</h2>
        <p className="mb-3 text-sm text-slate-600">
          Includes your existing category and collection names, and a filled example row.
        </p>
        <Button
          variant="secondary"
          onClick={() => downloadTemplateMutation.mutate()}
          disabled={downloadTemplateMutation.isPending}
        >
          {downloadTemplateMutation.isPending ? "Preparing…" : "Download template"}
        </Button>
        {templateError ? <p className="mt-2 text-sm text-red-600">{templateError}</p> : null}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">2. Upload your file</h2>
        <p className="mb-3 text-sm text-slate-600">
          Only creates new products - if a row's product slug already exists, that row is reported as an error, not
          merged.
        </p>
        <input
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          disabled={importMutation.isPending}
          className="text-sm text-slate-700"
        />
        {importMutation.isPending ? <p className="mt-1 text-xs text-slate-500">Importing…</p> : null}
        {importError ? <p className="mt-2 text-sm text-red-600">{importError}</p> : null}
      </Card>

      {results ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Results: {createdCount} created, {errorCount} failed
          </h2>
          <Table
            columns={[
              { key: "row", header: "Row", render: (row: ProductImportRowResult) => row.row },
              { key: "productName", header: "Product", render: (row: ProductImportRowResult) => row.productName },
              { key: "sku", header: "SKU", render: (row: ProductImportRowResult) => row.sku },
              {
                key: "status",
                header: "Status",
                render: (row: ProductImportRowResult) => (
                  <Badge tone={row.status === "created" ? "success" : "danger"}>
                    {row.status === "created" ? "Created" : "Failed"}
                  </Badge>
                ),
              },
              { key: "error", header: "Details", render: (row: ProductImportRowResult) => row.error ?? "—" },
            ]}
            rows={results}
            getRowKey={(row) => `${row.row}-${row.sku}`}
            emptyMessage="No rows processed."
          />
        </Card>
      ) : null}
    </div>
  );
}
