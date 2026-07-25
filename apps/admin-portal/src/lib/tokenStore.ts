import type { TokenPair } from "@fashion-platform/api-client";

// Access token lives in memory only (bounds the XSS exposure window);
// refresh token is persisted so a page reload doesn't force a re-login.
const REFRESH_TOKEN_STORAGE_KEY = "admin_portal_refresh_token";

let accessToken: string | null = null;
let refreshToken: string | null = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  getRefreshToken(): string | null {
    return refreshToken;
  },

  hasPersistedSession(): boolean {
    return refreshToken !== null;
  },

  setTokens(tokens: TokenPair): void {
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
    notify();
  },

  clear(): void {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    notify();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
