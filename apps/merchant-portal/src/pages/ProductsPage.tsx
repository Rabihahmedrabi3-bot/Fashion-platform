import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, Table } from "@fashion-platform/ui";
import type { ProductListItem } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  active: "success",
  archived: "danger",
};

export function ProductsPage() {
  const { tenantId } = useTenantContext();
  const productsQuery = useQuery({
    queryKey: ["products", tenantId],
    queryFn: () => apiClient.listProducts(tenantId),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Products</h1>
        <div className="flex items-center gap-2">
          <Link to="/products/import">
            <Button variant="secondary">Import products</Button>
          </Link>
          <Link to="/products/new">
            <Button>New product</Button>
          </Link>
        </div>
      </div>
      <Card>
        <Table
          columns={[
            {
              key: "image",
              header: "",
              render: (row: ProductListItem) =>
                row.imageUrl ? (
                  <img src={row.imageUrl} alt={row.name} className="h-10 w-10 rounded object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded border border-dashed border-slate-300" />
                ),
            },
            {
              key: "name",
              header: "Name",
              render: (row: ProductListItem) => (
                <Link to={`/products/${row.id}`} className="font-medium text-slate-900 hover:underline">
                  {row.name}
                </Link>
              ),
            },
            { key: "slug", header: "Slug", render: (row: ProductListItem) => row.slug },
            { key: "variants", header: "Variants", render: (row: ProductListItem) => row.variantCount },
            {
              key: "status",
              header: "Status",
              render: (row: ProductListItem) => (
                <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status}</Badge>
              ),
            },
          ]}
          rows={productsQuery.data ?? []}
          getRowKey={(row) => row.id}
          emptyMessage={
            productsQuery.isLoading ? "Loading…" : "No products yet — use \"New product\" above to add one."
          }
        />
      </Card>
    </div>
  );
}
