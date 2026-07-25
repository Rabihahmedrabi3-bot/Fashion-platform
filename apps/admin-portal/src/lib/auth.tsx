import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MeResponse } from "@fashion-platform/shared-types";
import { apiClient } from "./apiClient";
import { tokenStore } from "./tokenStore";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: SessionStatus;
  me: MeResponse | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * No tenant-selection concept here (unlike merchant-portal's auth.tsx) -
 * a Super Admin logs in through the same /auth/login as any staff user
 * (platform authority is just a platform_admins row on an ordinary user),
 * and access is gated purely on me.isPlatformAdmin, checked by AppLayout.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);

  async function loadMe(): Promise<void> {
    const response = await apiClient.getMe();
    setMe(response);
    setStatus("authenticated");
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      if (!tokenStore.hasPersistedSession()) {
        setStatus("unauthenticated");
        return;
      }
      const refreshed = await apiClient.tryRefresh();
      if (cancelled) return;
      if (!refreshed) {
        tokenStore.clear();
        setStatus("unauthenticated");
        return;
      }
      try {
        await loadMe();
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const tokens = await apiClient.login({ email, password });
    tokenStore.setTokens(tokens);
    await loadMe();
  }

  async function logout(): Promise<void> {
    const refreshToken = tokenStore.getRefreshToken();
    tokenStore.clear();
    setMe(null);
    setStatus("unauthenticated");
    if (refreshToken) {
      try {
        await apiClient.logout(refreshToken);
      } catch {
        // Already logged out locally - a failed server-side revoke isn't actionable here.
      }
    }
  }

  const value: AuthContextValue = { status, me, login, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
