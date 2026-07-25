"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CustomerMeResponse } from "@fashion-platform/shared-types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string | undefined;
}

interface CustomerAuthContextValue {
  status: SessionStatus;
  customer: CustomerMeResponse["customer"] | null;
  accessToken: string | null;
  register: (input: RegisterInput) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

// Keyed per store, not globally - a customer session at one store must not leak into another's.
function tokenStorageKey(storeSlug: string): string {
  return `storefront_customer_tokens_${storeSlug}`;
}

function readStoredTokens(storeSlug: string): TokenPair | null {
  const raw = localStorage.getItem(tokenStorageKey(storeSlug));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenPair;
  } catch {
    return null;
  }
}

function writeStoredTokens(storeSlug: string, tokens: TokenPair | null): void {
  if (tokens) {
    localStorage.setItem(tokenStorageKey(storeSlug), JSON.stringify(tokens));
  } else {
    localStorage.removeItem(tokenStorageKey(storeSlug));
  }
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? fallback;
}

export function CustomerAuthProvider({ storeSlug, children }: { storeSlug: string; children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [customer, setCustomer] = useState<CustomerMeResponse["customer"] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  async function loadMe(token: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/public/stores/${storeSlug}/customers/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("failed to load customer");
    const body = (await res.json()) as CustomerMeResponse;
    setCustomer(body.customer);
    setStatus("authenticated");
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      const stored = readStoredTokens(storeSlug);
      if (!stored) {
        setStatus("unauthenticated");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/public/stores/${storeSlug}/customers/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
      });
      if (cancelled) return;
      if (!res.ok) {
        writeStoredTokens(storeSlug, null);
        setStatus("unauthenticated");
        return;
      }
      const tokens = (await res.json()) as TokenPair;
      writeStoredTokens(storeSlug, tokens);
      setAccessToken(tokens.accessToken);
      try {
        await loadMe(tokens.accessToken);
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  async function register(input: RegisterInput): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/public/stores/${storeSlug}/customers/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await extractErrorMessage(res, "Registration failed."));
    const tokens = (await res.json()) as TokenPair;
    writeStoredTokens(storeSlug, tokens);
    setAccessToken(tokens.accessToken);
    await loadMe(tokens.accessToken);
  }

  async function login(email: string, password: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/public/stores/${storeSlug}/customers/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await extractErrorMessage(res, "Invalid email or password."));
    const tokens = (await res.json()) as TokenPair;
    writeStoredTokens(storeSlug, tokens);
    setAccessToken(tokens.accessToken);
    await loadMe(tokens.accessToken);
  }

  async function logout(): Promise<void> {
    const stored = readStoredTokens(storeSlug);
    const currentAccessToken = accessToken;
    writeStoredTokens(storeSlug, null);
    setAccessToken(null);
    setCustomer(null);
    setStatus("unauthenticated");
    if (stored && currentAccessToken) {
      try {
        await fetch(`${API_BASE_URL}/public/stores/${storeSlug}/customers/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAccessToken}` },
          body: JSON.stringify({ refreshToken: stored.refreshToken }),
        });
      } catch {
        // Already logged out locally - a failed server-side revoke isn't actionable here.
      }
    }
  }

  const value: CustomerAuthContextValue = { status, customer, accessToken, register, login, logout };
  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  return ctx;
}
