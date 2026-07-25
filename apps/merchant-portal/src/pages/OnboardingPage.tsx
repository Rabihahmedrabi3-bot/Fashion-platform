import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, FormField, Input } from "@fashion-platform/ui";
import { ApiError } from "@fashion-platform/api-client";
import { apiClient } from "../lib/apiClient";
import { useAuth } from "../lib/auth";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function OnboardingPage() {
  const { refreshMe, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.createTenant({ name, slug: slugify(name) });
      await refreshMe();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Set up your store</h1>
        <p className="mb-4 text-sm text-slate-500">
          Give your store a name. A Super Admin will need to approve it before it goes live.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <FormField label="Store name" htmlFor="name">
            <Input id="name" required value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create store"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-4 text-sm text-slate-500 hover:text-slate-700"
        >
          Log out
        </button>
      </Card>
    </div>
  );
}
