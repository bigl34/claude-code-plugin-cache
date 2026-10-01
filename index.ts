
export const TTL = {
  MINUTE: 60_000,
  FIVE_MINUTES: 300_000,
  FIFTEEN_MINUTES: 900_000,
  THIRTY_MINUTES: 1_800_000,
  HOUR: 3_600_000,
  SIX_HOURS: 21_600_000,
  TWELVE_HOURS: 43_200_000,
  DAY: 86_400_000,
  WEEK: 604_800_000,
} as const;

export { PluginCache } from "./cache";

export type {
  CacheConfig,
  CacheEntry,
  CacheManifest,
  CacheResult,
  CacheStats,
  CleanupResult,
  GetOptions,
  GetOrFetchOptions,
  GlobalCacheStats,
  ManifestEntry,
  SetOptions,
} from "./types";

export {
  cleanupIfNeeded,
  clearAll,
  clearNamespace,
  performCleanup,
  purgeExpired,
} from "./cleanup";

export { validateCacheNamespace } from "./namespace";

export { createCacheKey } from "./validation";

export { getGlobalStats } from "./cli";
