
export interface CacheEntry<T = unknown> {
  data: T;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
  size: number;
}

export interface ManifestEntry {
  filePath: string;
  namespace: string;
  key: string;
  size: number;
  lastAccessedAt: string;
  expiresAt: string;
}

export interface CacheManifest {
  version: number;
  totalSize: number;
  maxSize: number;
  entries: Record<string, ManifestEntry>;
  lastCleanup?: string;
}

export interface CacheConfig {
  namespace: string;
  defaultTTL?: number;
  defaultStaleWhileRevalidate?: number;
  maxEntrySize?: number;
  cacheDir?: string;
  disabled?: boolean;
}

export interface GetOptions {
  ttl?: number;
  staleWhileRevalidate?: number;
}

export interface SetOptions {
  ttl?: number;
}

export interface GetOrFetchOptions extends SetOptions {
  bypassCache?: boolean;
  staleWhileRevalidate?: number;
}

export interface CacheResult<T> {
  data: T | null;
  hit: boolean;
  stale: boolean;
  needsRevalidation: boolean;
  entry?: CacheEntry<T>;
}

export interface CacheStats {
  namespace: string;
  entryCount: number;
  totalSize: number;
  oldestEntry?: string;
  newestEntry?: string;
  expiredCount: number;
  staleCount: number;
}

export interface GlobalCacheStats {
  totalEntries: number;
  totalSize: number;
  maxSize: number;
  usagePercent: number;
  byNamespace: Record<string, CacheStats>;
  lastCleanup?: string;
}

export interface CleanupResult {
  entriesRemoved: number;
  bytesFreed: number;
  newTotalSize: number;
}
