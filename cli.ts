#!/usr/bin/env node
/**
 * Plugin Cache CLI - Global cache management
 *
 * Usage:
 *   npx plugin-cache stats           Show all plugin cache statistics
 *   npx plugin-cache purge-expired   Remove expired entries
 *   npx plugin-cache clear-all       Clear entire cache
 *   npx plugin-cache clear <ns>      Clear specific namespace
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CacheManifest, GlobalCacheStats, CacheStats } from "./types";
import { purgeExpired, clearAll, clearNamespace } from "./cleanup";

const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".cache", "plugin-cache");
const DEFAULT_SWR = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get global cache statistics
 */
export function getGlobalStats(cacheDir?: string): GlobalCacheStats {
  const dir = cacheDir || DEFAULT_CACHE_DIR;
  const manifestPath = path.join(dir, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    return {
      totalEntries: 0,
      totalSize: 0,
      maxSize: 500 * 1024 * 1024,
      usagePercent: 0,
      byNamespace: {},
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as CacheManifest;
  const now = new Date();
  const byNamespace: Record<string, CacheStats> = {};

  // Group by namespace
  for (const entry of Object.values(manifest.entries)) {
    if (!byNamespace[entry.namespace]) {
      byNamespace[entry.namespace] = {
        namespace: entry.namespace,
        entryCount: 0,
        totalSize: 0,
        expiredCount: 0,
        staleCount: 0,
      };
    }

    const ns = byNamespace[entry.namespace];
    ns.entryCount++;
    ns.totalSize += entry.size;

    const expiresAt = new Date(entry.expiresAt);
    const swrExpiresAt = new Date(expiresAt.getTime() + DEFAULT_SWR);

    if (now > swrExpiresAt) {
      ns.expiredCount++;
    } else if (now > expiresAt) {
      ns.staleCount++;
    }

    if (!ns.oldestEntry || entry.lastAccessedAt < ns.oldestEntry) {
      ns.oldestEntry = entry.lastAccessedAt;
    }
    if (!ns.newestEntry || entry.lastAccessedAt > ns.newestEntry) {
      ns.newestEntry = entry.lastAccessedAt;
    }
  }

  return {
    totalEntries: Object.keys(manifest.entries).length,
    totalSize: manifest.totalSize,
    maxSize: manifest.maxSize,
    usagePercent: (manifest.totalSize / manifest.maxSize) * 100,
    byNamespace,
    lastCleanup: manifest.lastCleanup,
  };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Main CLI handler
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "stats": {
      const stats = getGlobalStats();
      console.log("\n=== Plugin Cache Statistics ===\n");
      console.log(`Total entries: ${stats.totalEntries}`);
      console.log(`Total size: ${formatBytes(stats.totalSize)} / ${formatBytes(stats.maxSize)}`);
      console.log(`Usage: ${stats.usagePercent.toFixed(1)}%`);
      if (stats.lastCleanup) {
        console.log(`Last cleanup: ${stats.lastCleanup}`);
      }

      if (Object.keys(stats.byNamespace).length > 0) {
        console.log("\n--- By Plugin ---\n");
        for (const [ns, nsStats] of Object.entries(stats.byNamespace)) {
          console.log(`${ns}:`);
          console.log(`  Entries: ${nsStats.entryCount}`);
          console.log(`  Size: ${formatBytes(nsStats.totalSize)}`);
          console.log(`  Expired: ${nsStats.expiredCount}, Stale: ${nsStats.staleCount}`);
          if (nsStats.oldestEntry) {
            console.log(`  Oldest: ${nsStats.oldestEntry}`);
          }
          console.log("");
        }
      } else {
        console.log("\nNo cached data found.");
      }
      break;
    }

    case "purge-expired": {
      console.log("Purging expired entries...");
      const result = purgeExpired(DEFAULT_CACHE_DIR);
      console.log(`Removed ${result.entriesRemoved} entries`);
      console.log(`Freed ${formatBytes(result.bytesFreed)}`);
      console.log(`New total size: ${formatBytes(result.newTotalSize)}`);
      break;
    }

    case "clear-all": {
      console.log("Clearing all cache...");
      const result = clearAll(DEFAULT_CACHE_DIR);
      console.log(`Removed ${result.entriesRemoved} entries`);
      console.log(`Freed ${formatBytes(result.bytesFreed)}`);
      break;
    }

    case "clear": {
      const namespace = args[1];
      if (!namespace) {
        console.error("Error: Please specify a namespace to clear");
        console.log("Usage: npx plugin-cache clear <namespace>");
        process.exit(1);
      }
      console.log(`Clearing cache for ${namespace}...`);
      const result = clearNamespace(DEFAULT_CACHE_DIR, namespace);
      console.log(`Removed ${result.entriesRemoved} entries`);
      console.log(`Freed ${formatBytes(result.bytesFreed)}`);
      break;
    }

    case "help":
    case "--help":
    case "-h":
    default: {
      console.log(`
Plugin Cache CLI - Global cache management

Usage:
  npx plugin-cache stats           Show all plugin cache statistics
  npx plugin-cache purge-expired   Remove expired entries (past SWR window)
  npx plugin-cache clear-all       Clear entire cache
  npx plugin-cache clear <ns>      Clear cache for specific plugin namespace

Cache location: ${DEFAULT_CACHE_DIR}
`);
      break;
    }
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
