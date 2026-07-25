import { ApiClient } from "@fashion-platform/api-client";
import { tokenStore } from "./tokenStore";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export const apiClient = new ApiClient({
  baseUrl,
  getAccessToken: () => tokenStore.getAccessToken(),
  getRefreshToken: () => tokenStore.getRefreshToken(),
  onTokensRefreshed: (tokens) => tokenStore.setTokens(tokens),
  onSessionExpired: () => tokenStore.clear(),
});
