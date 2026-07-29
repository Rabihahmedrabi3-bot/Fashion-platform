import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MeResponse } from "@fashion-platform/shared-types";
import { apiClient } from "./apiClient";
import { tokenStore } from "./tokenStore";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: SessionStatus;
  me: MeResponse | null;
  selectedTenantId: string | null;
  selectTenant: (tenantId: string) => void;
  login: (credentials: { email?: string; phone?: string }, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SELECTED_TENANT_STORAGE_KEY = "merchant_portal_selected_tenant";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(
    localStorage.getItem(SELECTED_TENANT_STORAGE_KEY),
  );

  async function loadMe(): Promise<void> {
    const response = await apiClient.getMe();
    setMe(response);
    setStatus("authenticated");

    const activeMemberships = response.memberships.filter((m) => m.membershipStatus === "active");
    const stillValid = activeMemberships.some((m) => m.tenantId === selectedTenantId);
    if (!stillValid) {
      const first = activeMemberships[0]?.tenantId ?? null;
      setSelectedTenantId(first);
      if (first) localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, first);
    }
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

  async function login(credentials: { email?: string; phone?: string }, password: string): Promise<void> {
    const tokens = await apiClient.login({ ...credentials, password });
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

  function selectTenant(tenantId: string): void {
    setSelectedTenantId(tenantId);
    localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, tenantId);
  }

  const value: AuthContextValue = {
    status,
    me,
    selectedTenantId,
    selectTenant,
    login,
    logout,
    refreshMe: loadMe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
