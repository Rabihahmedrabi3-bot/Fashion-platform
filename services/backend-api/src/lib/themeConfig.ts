import { DEFAULT_THEME_CONFIG, type ThemeConfig } from "@fashion-platform/shared-types";

/**
 * stores.branding_theme_config is jsonb with no DB-level shape guarantee.
 * Rows created before ThemeConfig existed (or a genuinely empty `{}`) won't
 * have the now-required `hero.title` - fall back to a real default rather
 * than lying about the type or crashing.
 */
export function normalizeThemeConfig(raw: unknown): ThemeConfig {
  if (
    raw &&
    typeof raw === "object" &&
    "hero" in raw &&
    typeof (raw as { hero?: unknown }).hero === "object" &&
    (raw as { hero?: { title?: unknown } }).hero !== null &&
    typeof (raw as { hero: { title?: unknown } }).hero.title === "string"
  ) {
    return raw as ThemeConfig;
  }
  return DEFAULT_THEME_CONFIG;
}
