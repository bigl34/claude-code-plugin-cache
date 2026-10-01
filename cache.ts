
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";
import {
  CacheConfig,
  CacheEntry,
  CacheManifest,
  CacheResult,
  CacheStats,
  GetOptions,
  GetOrFetchOptions,
  ManifestEntry,
  SetOptions,
} from "./types";
import { cleanupIfNeeded } from "./cleanup";
import { resolveCachePath, validateCacheNamespace } from "./namespace";

const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".cache", "plugin-cache");
const DEFAULT_MAX_SIZE = 500 * 1024 * 1024;

function resolveCacheRoot(configured?: string): string {
  const fromEnv = process.env.PLUGIN_CACHE_DIR?.trim();
  return path.resolve(configured || fromEnv || DEFAULT_CACHE_DIR);
}
const DEFAULT_MAX_ENTRY_SIZE = 10 * 1024 * 1024;
const DEFAULT_TTL = 300_000;
const DEFAULT_STALE_WHILE_REVALIDATE = 86_400_000;
const MANIFEST_VERSION = 2;

export class PluginCache {
  private namespace: string;
  private cacheDir: string;
  private namespaceDir: string;
  private manifestPath: string;
  private defaultTTL: number;
  private defaultSWR: number;
  private maxEntrySize: number;
  private disabled: boolean;

  constructor(config: CacheConfig) {
    this.namespace = validateCacheNamespace(config.namespace);
    this.cacheDir = resolveCacheRoot(config.cacheDir);
    this.namespaceDir = resolveCachePath(this.cacheDir, this.namespace);
    this.manifestPath = path.join(this.cacheDir, "manifest.json");
    this.defaultTTL = config.defaultTTL ?? DEFAULT_TTL;
    this.defaultSWR = config.defaultStaleWhileRevalidate ?? DEFAULT_STALE_WHILE_REVALIDATE;
    this.maxEntrySize = config.maxEntrySize ?? DEFAULT_MAX_ENTRY_SIZE;
    this.disabled = config.disabled ?? false;

    if (!this.disabled) {
      this.ensureDirectories();
      this.migrateManifestIfNeeded();
    }
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    if (!fs.existsSync(this.namespaceDir)) {
      fs.mkdirSync(this.namespaceDir, { recursive: true });
    }
  }

  private emptyManifest(maxSize = DEFAULT_MAX_SIZE): CacheManifest {
    return {
      version: MANIFEST_VERSION,
      totalSize: 0,
      maxSize,
      entries: {},
    };
  }

  private isInsideCacheDir(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const relative = path.relative(this.cacheDir, resolved);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  private migrateManifestIfNeeded(): void {
    if (!fs.existsSync(this.manifestPath)) return;

    let manifest: CacheManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(this.manifestPath, "utf-8")) as CacheManifest;
    } catch {
      this.saveManifest(this.emptyManifest());
      return;
    }

    if (manifest.version === MANIFEST_VERSION) return;

    for (const entry of Object.values(manifest.entries ?? {})) {
      if (entry.filePath && this.isInsideCacheDir(entry.filePath) && fs.existsSync(entry.filePath)) {
        try {
          fs.unlinkSync(entry.filePath);
        } catch {
        }
      }
    }

    this.saveManifest(this.emptyManifest(manifest.maxSize || DEFAULT_MAX_SIZE));
  }

  private getManifest(): CacheManifest {
    if (!fs.existsSync(this.manifestPath)) {
      return this.emptyManifest();
    }
    try {
      const content = fs.readFileSync(this.manifestPath, "utf-8");
      const manifest = JSON.parse(content) as CacheManifest;
      if (manifest.version !== MANIFEST_VERSION) {
        return this.emptyManifest(manifest.maxSize || DEFAULT_MAX_SIZE);
      }
      return manifest;
    } catch {
      return this.emptyManifest();
    }
  }

  private saveManifest(manifest: CacheManifest): void {
    const tempPath = `${this.manifestPath}.tmp.${process.pid}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2));
      fs.renameSync(tempPath, this.manifestPath);
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
      }
      throw error;
    }
  }

  private getFilePath(key: string): string {
    const digest = createHash("sha256")
      .update(`${this.namespace}\0${key}`)
      .digest("base64url");
    return resolveCachePath(this.namespaceDir, `${digest}.json`);
  }

  disable(): void {
    this.disabled = true;
  }

  enable(): void {
    this.disabled = false;
    this.ensureDirectories();
    this.migrateManifestIfNeeded();
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  get<T>(key: string, options?: GetOptions): CacheResult<T> {
    if (this.disabled) {
      return { data: null, hit: false, stale: false, needsRevalidation: true };
    }

    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      return { data: null, hit: false, stale: false, needsRevalidation: true };
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const entry = JSON.parse(content) as CacheEntry<T>;
      const now = new Date();
      const expiresAt = new Date(entry.expiresAt);
      const ttl = options?.ttl ?? this.defaultTTL;
      const swr = options?.staleWhileRevalidate ?? this.defaultSWR;

      entry.lastAccessedAt = now.toISOString();
      fs.writeFileSync(filePath, JSON.stringify(entry));

      const manifest = this.getManifest();
      const manifestKey = filePath;
      if (manifest.entries[manifestKey]) {
        manifest.entries[manifestKey].lastAccessedAt = entry.lastAccessedAt;
        this.saveManifest(manifest);
      }

      const isExpired = now > expiresAt;
      const swrExpiresAt = new Date(expiresAt.getTime() + swr);
      const isWithinSWR = now <= swrExpiresAt;

      if (isExpired && !isWithinSWR) {
        this.invalidate(key);
        return { data: null, hit: false, stale: false, needsRevalidation: true };
      }

      return {
        data: entry.data,
        hit: true,
        stale: isExpired,
        needsRevalidation: isExpired,
        entry,
      };
    } catch {
      return { data: null, hit: false, stale: false, needsRevalidation: true };
    }
  }

  async set<T>(key: string, data: T, options?: SetOptions): Promise<void> {
    if (this.disabled) return;

    const serialized = JSON.stringify(data);
    const size = Buffer.byteLength(serialized, "utf-8");

    if (size > this.maxEntrySize) {
      console.warn(
        `[cache] Entry "${key}" exceeds max size (${size} > ${this.maxEntrySize}), skipping`
      );
      return;
    }

    const ttl = options?.ttl ?? this.defaultTTL;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl);

    const entry: CacheEntry<T> = {
      data,
      createdAt: now.toISOString(),
      lastAccessedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      size,
    };

    const filePath = this.getFilePath(key);

    const manifest = this.getManifest();
    const oldEntry = manifest.entries[filePath];
    const oldSize = oldEntry?.size ?? 0;

    manifest.entries[filePath] = {
      filePath,
      namespace: this.namespace,
      key,
      size,
      lastAccessedAt: entry.lastAccessedAt,
      expiresAt: entry.expiresAt,
    };
    manifest.totalSize = manifest.totalSize - oldSize + size;
    this.saveManifest(manifest);

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));

    await cleanupIfNeeded(this.cacheDir);
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: GetOrFetchOptions
  ): Promise<T> {
    if (this.disabled || options?.bypassCache) {
      const data = await fetcher();
      if (!this.disabled) {
        await this.set(key, data, options);
      }
      return data;
    }

    const cached = this.get<T>(key, {
      ttl: options?.ttl,
      staleWhileRevalidate: options?.staleWhileRevalidate,
    });

    if (cached.hit && !cached.stale) {
      return cached.data!;
    }

    if (cached.hit && cached.stale) {
      const freshData = await fetcher();
      await this.set(key, freshData, options);
      return freshData;
    }

    const data = await fetcher();
    await this.set(key, data, options);
    return data;
  }

  invalidate(key: string): boolean {
    if (this.disabled) return false;

    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) return false;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const entry = JSON.parse(content) as CacheEntry;

      fs.unlinkSync(filePath);

      const manifest = this.getManifest();
      if (manifest.entries[filePath]) {
        manifest.totalSize -= entry.size;
        delete manifest.entries[filePath];
        this.saveManifest(manifest);
      }

      return true;
    } catch {
      return false;
    }
  }

  invalidatePattern(pattern: string | RegExp): number {
    if (this.disabled) return 0;

    const manifest = this.getManifest();
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const [filePath, entry] of Object.entries(manifest.entries)) {
      if (entry.namespace === this.namespace && regex.test(entry.key)) {
        if (this.invalidate(entry.key)) {
          count++;
        }
      }
    }

    return count;
  }

  clear(): number {
    if (this.disabled) return 0;

    const manifest = this.getManifest();
    let count = 0;
    let freedSize = 0;

    for (const [filePath, entry] of Object.entries(manifest.entries)) {
      if (entry.namespace === this.namespace) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          freedSize += entry.size;
          delete manifest.entries[filePath];
          count++;
        } catch {
        }
      }
    }

    manifest.totalSize -= freedSize;
    this.saveManifest(manifest);

    return count + this.removeOrphanedFiles();
  }

  private removeOrphanedFiles(): number {
    if (!fs.existsSync(this.namespaceDir)) return 0;

    let removed = 0;
    for (const name of fs.readdirSync(this.namespaceDir)) {
      if (!name.endsWith(".json")) continue;
      try {
        fs.unlinkSync(resolveCachePath(this.namespaceDir, name));
        removed++;
      } catch {
      }
    }
    return removed;
  }

  getStats(): CacheStats {
    if (this.disabled) {
      return {
        namespace: this.namespace,
        entryCount: 0,
        totalSize: 0,
        expiredCount: 0,
        staleCount: 0,
      };
    }

    const manifest = this.getManifest();
    const now = new Date();
    let entryCount = 0;
    let totalSize = 0;
    let expiredCount = 0;
    let staleCount = 0;
    let oldestEntry: string | undefined;
    let newestEntry: string | undefined;

    for (const entry of Object.values(manifest.entries)) {
      if (entry.namespace !== this.namespace) continue;

      entryCount++;
      totalSize += entry.size;

      const expiresAt = new Date(entry.expiresAt);
      const swrExpiresAt = new Date(expiresAt.getTime() + this.defaultSWR);

      if (now > swrExpiresAt) {
        expiredCount++;
      } else if (now > expiresAt) {
        staleCount++;
      }

      if (!oldestEntry || entry.lastAccessedAt < oldestEntry) {
        oldestEntry = entry.lastAccessedAt;
      }
      if (!newestEntry || entry.lastAccessedAt > newestEntry) {
        newestEntry = entry.lastAccessedAt;
      }
    }

    return {
      namespace: this.namespace,
      entryCount,
      totalSize,
      expiredCount,
      staleCount,
      oldestEntry,
      newestEntry,
    };
  }

  keys(): string[] {
    if (this.disabled) return [];

    const manifest = this.getManifest();
    return Object.values(manifest.entries)
      .filter((e) => e.namespace === this.namespace)
      .map((e) => e.key);
  }

  has(key: string): boolean {
    if (this.disabled) return false;
    return fs.existsSync(this.getFilePath(key));
  }
}

