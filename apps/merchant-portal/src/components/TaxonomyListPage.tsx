import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ZodType } from "zod";
import { Button, Card, FormField, Input, Table } from "@fashion-platform/ui";
import { ApiError } from "@fashion-platform/api-client";
import { useTenantContext } from "../lib/useTenantContext";

interface TaxonomyItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

interface CreateTaxonomyInput {
  name: string;
  slug: string;
  description?: string | undefined;
}

export interface TaxonomyListPageProps {
  title: string;
  queryKey: string;
  createSchema: ZodType<CreateTaxonomyInput>;
  list: (tenantId: string) => Promise<TaxonomyItem[]>;
  create: (tenantId: string, input: CreateTaxonomyInput) => Promise<TaxonomyItem>;
  remove: (tenantId: string, id: string) => Promise<void>;
}

/** Categories and collections are structurally identical CRUD screens (name/slug/description) - shared here rather than duplicated. */
export function TaxonomyListPage({ title, queryKey, createSchema, list, create, remove }: TaxonomyListPageProps) {
  const { tenantId } = useTenantContext();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: [queryKey, tenantId],
    queryFn: () => list(tenantId),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTaxonomyInput>({ resolver: zodResolver(createSchema) });

  const createMutation = useMutation({
    mutationFn: (input: CreateTaxonomyInput) => create(tenantId, input),
    onSuccess: () => {
      setFormError(null);
      reset();
      void queryClient.invalidateQueries({ queryKey: [queryKey, tenantId] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Something went wrong."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove(tenantId, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [queryKey, tenantId] }),
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Could not delete - it may still be in use."),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Add new</h2>
        <form
          onSubmit={handleSubmit((input) => createMutation.mutate(input))}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end"
        >
          <FormField label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register("name")} />
          </FormField>
          <FormField label="Slug" htmlFor="slug" error={errors.slug?.message}>
            <Input id="slug" {...register("slug")} placeholder="lowercase-with-hyphens" />
          </FormField>
          <FormField label="Description (optional)" htmlFor="description" error={errors.description?.message}>
            <Input id="description" {...register("description")} />
          </FormField>
          <div className="sm:col-span-3">
            {formError ? <p className="mb-2 text-sm text-red-600">{formError}</p> : null}
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <Table
          columns={[
            { key: "name", header: "Name", render: (row: TaxonomyItem) => row.name },
            { key: "slug", header: "Slug", render: (row: TaxonomyItem) => row.slug },
            { key: "description", header: "Description", render: (row: TaxonomyItem) => row.description ?? "—" },
            {
              key: "actions",
              header: "",
              render: (row: TaxonomyItem) => (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(row.id)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Delete
                </button>
              ),
            },
          ]}
          rows={listQuery.data ?? []}
          getRowKey={(row) => row.id}
          emptyMessage={listQuery.isLoading ? "Loading…" : "None yet."}
        />
      </Card>
    </div>
  );
}
