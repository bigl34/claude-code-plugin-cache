/**
 * Plugin Cache - Shared cache library for Claude Code plugins
 *
 * @example
 * ```typescript
 * import { PluginCache, TTL } from "@local/plugin-cache";
 *
 * const cache = new PluginCache({
 *   namespace: "my-plugin",
 *   defaultTTL: TTL.FIVE_MINUTES,
 * });
 *
 * // Cache-aside pattern
 * const data = await cache.getOrFetch(
 *   "my-key",
 *   () => fetchFromAPI(),
 *   { ttl: TTL.HOUR }
 * );
 *
 * // Invalidate after mutations
 * cache.invalidate("my-key");
 * ```
 */

// TTL presets (in milliseconds)
export const TTL = {
  /** 1 minute */
  MINUTE: 60_000,
  /** 5 minutes */
  FIVE_MINUTES: 300_000,
  /** 15 minutes */
  FIFTEEN_MINUTES: 900_000,
  /** 30 minutes */
  THIRTY_MINUTES: 1_800_000,
  /** 1 hour */
  HOUR: 3_600_000,
  /** 6 hours */
  SIX_HOURS: 21_600_000,
  /** 12 hours */
  TWELVE_HOURS: 43_200_000,
  /** 24 hours / 1 day */
  DAY: 86_400_000,
  /** 1 week */
  WEEK: 604_800_000,
} as const;

// Core cache class
export { PluginCache } from "./cache";

// Types
export type {
  CacheConfig,
  CacheEntry,
  CacheManifest,
  CacheResult,
  CacheStats,
  CacheValidator,
  CleanupResult,
  GetOptions,
  GetOrFetchOptions,
  GlobalCacheStats,
  ManifestEntry,
  SetOptions,
} from "./types";

// Cleanup functions
export {
  cleanupIfNeeded,
  clearAll,
  clearNamespace,
  performCleanup,
  purgeExpired,
} from "./cleanup";

// Validation helpers
export {
  buildConditionalHeaders,
  conditionalFetch,
  createCacheKey,
  extractValidator,
  isNotModified,
  parseCacheKey,
} from "./validation";

// Global stats helper
export { getGlobalStats } from "./cli";
