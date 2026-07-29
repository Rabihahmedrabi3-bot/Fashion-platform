import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, FormField, Input } from "@fashion-platform/ui";
import { ApiError } from "@fashion-platform/api-client";
import { apiClient } from "../lib/apiClient";

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.register({ email, password, fullName, phone: phone.trim() || null });
      navigate(`/verify-email?email=${encodeURIComponent(email)}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Create your account</h1>
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <FormField label="Full name" htmlFor="fullName">
            <Input id="fullName" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </FormField>
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          <FormField label="Phone number (optional)" htmlFor="phone">
            <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </FormField>
          <FormField label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
