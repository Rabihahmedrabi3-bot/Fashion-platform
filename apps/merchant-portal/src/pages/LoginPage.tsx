import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, FormField, Input } from "@fashion-platform/ui";
import { ApiError } from "@fashion-platform/api-client";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = identifier.trim();
      const credentials = trimmed.includes("@") ? { email: trimmed } : { phone: trimmed };
      await login(credentials, password);
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
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Merchant Portal</h1>
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <FormField label="Email or phone number" htmlFor="identifier">
            <Input
              id="identifier"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </FormField>
          <FormField label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Don&apos;t have a store yet?{" "}
          <Link to="/register" className="font-medium text-slate-900 underline">
            Register
          </Link>
        </p>
      </Card>
    </div>
  );
}
