import { createCollectionRequestSchema } from "@fashion-platform/validation";
import { TaxonomyListPage } from "../components/TaxonomyListPage";
import { apiClient } from "../lib/apiClient";

export function CollectionsPage() {
  return (
    <TaxonomyListPage
      title="Collections"
      queryKey="collections"
      createSchema={createCollectionRequestSchema}
      list={(tenantId) => apiClient.listCollections(tenantId)}
      create={(tenantId, input) => apiClient.createCollection(tenantId, input)}
      remove={(tenantId, id) => apiClient.deleteCollection(tenantId, id)}
    />
  );
}
