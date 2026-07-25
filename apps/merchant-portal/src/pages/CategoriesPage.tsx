import { createCategoryRequestSchema } from "@fashion-platform/validation";
import { TaxonomyListPage } from "../components/TaxonomyListPage";
import { apiClient } from "../lib/apiClient";

export function CategoriesPage() {
  return (
    <TaxonomyListPage
      title="Categories"
      queryKey="categories"
      createSchema={createCategoryRequestSchema}
      list={(tenantId) => apiClient.listCategories(tenantId)}
      create={(tenantId, input) => apiClient.createCategory(tenantId, input)}
      remove={(tenantId, id) => apiClient.deleteCategory(tenantId, id)}
    />
  );
}
