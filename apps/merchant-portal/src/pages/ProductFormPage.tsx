import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { createProductRequestSchema, type CreateProductRequestInput } from "@fashion-platform/validation";
import { Badge, Button, Card, FormField, Input, Select, Table } from "@fashion-platform/ui";
import { ApiError } from "@fashion-platform/api-client";
import type { ProductVariantWithInventory } from "@fashion-platform/shared-types";
import { apiClient } from "../lib/apiClient";
import { useTenantContext } from "../lib/useTenantContext";

export function ProductFormPage() {
  const { tenantId } = useTenantContext();
  const { productId } = useParams<{ productId: string }>();
  const isEditing = Boolean(productId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["categories", tenantId],
    queryFn: () => apiClient.listCategories(tenantId),
  });
  const collectionsQuery = useQuery({
    queryKey: ["collections", tenantId],
    queryFn: () => apiClient.listCollections(tenantId),
  });
  const productQuery = useQuery({
    queryKey: ["product", tenantId, productId],
    queryFn: () => apiClient.getProduct(tenantId, productId as string),
    enabled: isEditing,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProductRequestInput>({ resolver: zodResolver(createProductRequestSchema) });

  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (productQuery.data) {
      reset({
        name: productQuery.data.name,
        slug: productQuery.data.slug,
        description: productQuery.data.description ?? undefined,
        categoryId: productQuery.data.categoryId ?? "",
        brand: productQuery.data.brand ?? undefined,
        gender: productQuery.data.gender ?? undefined,
      });
    }
  }, [productQuery.data, reset]);

  const saveMutation = useMutation({
    mutationFn: (input: CreateProductRequestInput) =>
      isEditing
        ? apiClient.updateProduct(tenantId, productId as string, input)
        : apiClient.createProduct(tenantId, input),
    onSuccess: (product) => {
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      if (!isEditing) {
        navigate(`/products/${product.id}`, { replace: true });
      } else {
        void queryClient.invalidateQueries({ queryKey: ["product", tenantId, productId] });
      }
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Something went wrong."),
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiClient.archiveProduct(tenantId, productId as string),
    onSuccess: () => {
      setConfirmingArchive(false);
      void queryClient.invalidateQueries({ queryKey: ["product", tenantId, productId] });
      void queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: (status: "draft" | "active") =>
      apiClient.updateProduct(tenantId, productId as string, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product", tenantId, productId] });
      void queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
    },
  });

  // --- Image ---
  const [imageError, setImageError] = useState<string | null>(null);

  const uploadImageMutation = useMutation({
    mutationFn: (file: File) => apiClient.uploadProductImage(tenantId, productId as string, file),
    onSuccess: () => {
      setImageError(null);
      void queryClient.invalidateQueries({ queryKey: ["product", tenantId, productId] });
      void queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
    },
    onError: (err) => setImageError(err instanceof ApiError ? err.message : "Could not upload image."),
  });

  function handleImageChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) uploadImageMutation.mutate(file);
    event.target.value = "";
  }

  // --- Variants ---
  const [variantSku, setVariantSku] = useState("");
  const [variantSize, setVariantSize] = useState("");
  const [variantColor, setVariantColor] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [variantError, setVariantError] = useState<string | null>(null);

  const addVariantMutation = useMutation({
    mutationFn: () =>
      apiClient.createVariant(tenantId, productId as string, {
        sku: variantSku,
        size: variantSize || null,
        color: variantColor || null,
        priceCents: Math.round(Number(variantPrice) * 100),
      }),
    onSuccess: () => {
      setVariantError(null);
      setVariantSku("");
      setVariantSize("");
      setVariantColor("");
      setVariantPrice("");
      void queryClient.invalidateQueries({ queryKey: ["product", tenantId, productId] });
    },
    onError: (err) => setVariantError(err instanceof ApiError ? err.message : "Could not add variant."),
  });

  const updateInventoryMutation = useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) =>
      apiClient.updateInventory(tenantId, productId as string, variantId, quantity),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["product", tenantId, productId] }),
  });

  const archiveVariantMutation = useMutation({
    mutationFn: (variantId: string) => apiClient.archiveVariant(tenantId, productId as string, variantId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["product", tenantId, productId] }),
  });

  // --- Collections ---
  const toggleCollectionMutation = useMutation({
    mutationFn: ({ collectionId, member }: { collectionId: string; member: boolean }) =>
      member
        ? apiClient.removeProductFromCollection(tenantId, productId as string, collectionId)
        : apiClient.addProductToCollection(tenantId, productId as string, collectionId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["product", tenantId, productId] }),
  });

  async function handleSave(input: CreateProductRequestInput): Promise<void> {
    await saveMutation.mutateAsync(input);
  }

  async function handleAddVariant(event: FormEvent): Promise<void> {
    event.preventDefault();
    await addVariantMutation.mutateAsync();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{isEditing ? "Edit product" : "New product"}</h1>
          {isEditing && productQuery.data ? (
            <Badge tone={productQuery.data.status === "active" ? "success" : "danger"}>
              {productQuery.data.status}
            </Badge>
          ) : null}
        </div>
        {isEditing && productQuery.data?.status !== "archived" ? (
          <div className="flex items-center gap-2">
            {productQuery.data?.status === "active" ? (
              <Button
                variant="secondary"
                onClick={() => setStatusMutation.mutate("draft")}
                disabled={setStatusMutation.isPending}
              >
                Unpublish
              </Button>
            ) : (
              <Button onClick={() => setStatusMutation.mutate("active")} disabled={setStatusMutation.isPending}>
                Publish
              </Button>
            )}
            {confirmingArchive ? (
              <span className="flex items-center gap-2 text-sm">
                Archive this product?
                <Button
                  variant="danger"
                  onClick={() => archiveMutation.mutate()}
                  disabled={archiveMutation.isPending}
                >
                  Yes, archive
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingArchive(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button variant="danger" onClick={() => setConfirmingArchive(true)}>
                Archive
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <Card>
        <form onSubmit={handleSubmit(handleSave)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register("name")} />
          </FormField>
          <FormField label="Slug" htmlFor="slug" error={errors.slug?.message}>
            <Input id="slug" {...register("slug")} />
          </FormField>
          <FormField label="Category" htmlFor="categoryId">
            <Select id="categoryId" {...register("categoryId", { setValueAs: (v) => (v === "" ? undefined : v) })}>
              <option value="">None</option>
              {(categoriesQuery.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Brand" htmlFor="brand">
            <Input id="brand" {...register("brand")} />
          </FormField>
          <FormField label="Gender" htmlFor="gender">
            <Input id="gender" {...register("gender")} placeholder="women / men / unisex" />
          </FormField>
          <FormField label="Description" htmlFor="description">
            <Input id="description" {...register("description")} />
          </FormField>
          <div className="sm:col-span-2">
            {formError ? <p className="mb-2 text-sm text-red-600">{formError}</p> : null}
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : isEditing ? "Save changes" : "Create product"}
            </Button>
          </div>
        </form>
      </Card>

      {isEditing ? (
        <>
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Product photo</h2>
            <div className="flex items-center gap-4">
              {productQuery.data?.imageUrl ? (
                <img
                  src={productQuery.data.imageUrl}
                  alt={productQuery.data.name}
                  className="h-24 w-24 rounded-md border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-400">
                  No photo
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageChange}
                  disabled={uploadImageMutation.isPending}
                  className="text-sm text-slate-700"
                />
                {uploadImageMutation.isPending ? (
                  <p className="mt-1 text-xs text-slate-500">Uploading…</p>
                ) : null}
                {imageError ? <p className="mt-1 text-sm text-red-600">{imageError}</p> : null}
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Variants</h2>
            <Table
              columns={[
                { key: "sku", header: "SKU", render: (row: ProductVariantWithInventory) => row.sku },
                { key: "size", header: "Size", render: (row: ProductVariantWithInventory) => row.size ?? "—" },
                { key: "color", header: "Color", render: (row: ProductVariantWithInventory) => row.color ?? "—" },
                {
                  key: "price",
                  header: "Price",
                  render: (row: ProductVariantWithInventory) => `$${(row.priceCents / 100).toFixed(2)}`,
                },
                {
                  key: "quantity",
                  header: "Stock",
                  render: (row: ProductVariantWithInventory) => (
                    <input
                      type="number"
                      min={0}
                      defaultValue={row.quantity}
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                      onBlur={(event) => {
                        const quantity = Number(event.target.value);
                        if (!Number.isNaN(quantity) && quantity !== row.quantity) {
                          updateInventoryMutation.mutate({ variantId: row.id, quantity });
                        }
                      }}
                    />
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (row: ProductVariantWithInventory) => (
                    <Badge tone={row.status === "active" ? "success" : "danger"}>{row.status}</Badge>
                  ),
                },
                {
                  key: "actions",
                  header: "",
                  render: (row: ProductVariantWithInventory) =>
                    row.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => archiveVariantMutation.mutate(row.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Archive
                      </button>
                    ) : null,
                },
              ]}
              rows={productQuery.data?.variants ?? []}
              getRowKey={(row) => row.id}
              emptyMessage="No variants yet."
            />

            <form
              onSubmit={(event) => void handleAddVariant(event)}
              className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-5 sm:items-end"
            >
              <FormField label="SKU" htmlFor="variantSku">
                <Input
                  id="variantSku"
                  required
                  value={variantSku}
                  onChange={(event) => setVariantSku(event.target.value)}
                />
              </FormField>
              <FormField label="Size" htmlFor="variantSize">
                <Input id="variantSize" value={variantSize} onChange={(event) => setVariantSize(event.target.value)} />
              </FormField>
              <FormField label="Color" htmlFor="variantColor">
                <Input
                  id="variantColor"
                  value={variantColor}
                  onChange={(event) => setVariantColor(event.target.value)}
                />
              </FormField>
              <FormField label="Price (USD)" htmlFor="variantPrice">
                <Input
                  id="variantPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={variantPrice}
                  onChange={(event) => setVariantPrice(event.target.value)}
                />
              </FormField>
              <div>
                {variantError ? <p className="mb-2 text-sm text-red-600">{variantError}</p> : null}
                <Button type="submit" disabled={addVariantMutation.isPending}>
                  {addVariantMutation.isPending ? "Adding…" : "Add variant"}
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Collections</h2>
            <div className="flex flex-wrap gap-2">
              {(collectionsQuery.data ?? []).map((collection) => {
                const isMember = productQuery.data?.collectionIds.includes(collection.id) ?? false;
                return (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => toggleCollectionMutation.mutate({ collectionId: collection.id, member: isMember })}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      isMember ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {collection.name}
                  </button>
                );
              })}
              {(collectionsQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No collections yet.</p>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
