# @local/plugin-cache

A shared persistent file-based cache library for Claude Code plugins.

## Features

- **Persistent file storage** in `~/.cache/plugin-cache/`
- **Per-plugin namespaces** for isolation
- **TTL-based expiration** with stale-while-revalidate
- **LRU eviction** at 90% of 500MB limit
- **Cache invalidation** via exact key or regex pattern
- **Global CLI** for cache management

## Installation

In your plugin's `package.json`:

```json
{
  "dependencies": {
    "@local/plugin-cache": "file:../../shared/cache"
  }
}
```

Then run `npm install`.

## Usage

### Basic Usage

```typescript
import { PluginCache, TTL, createCacheKey } from "@local/plugin-cache";

// Initialize with namespace
const cache = new PluginCache({
  namespace: "my-plugin",
  defaultTTL: TTL.FIFTEEN_MINUTES,
});

// Get or fetch pattern (recommended)
const data = await cache.getOrFetch(
  "my-cache-key",
  async () => {
    // Fetch data from API
    return await fetchFromAPI();
  },
  { ttl: TTL.HOUR }
);
```

### TTL Presets

```typescript
import { TTL } from "@local/plugin-cache";

TTL.MINUTE           // 60,000ms (1 minute)
TTL.FIVE_MINUTES     // 300,000ms (5 minutes)
TTL.FIFTEEN_MINUTES  // 900,000ms (15 minutes)
TTL.THIRTY_MINUTES   // 1,800,000ms (30 minutes)
TTL.HOUR             // 3,600,000ms (1 hour)
TTL.SIX_HOURS        // 21,600,000ms (6 hours)
TTL.TWELVE_HOURS     // 43,200,000ms (12 hours)
TTL.DAY              // 86,400,000ms (24 hours)
TTL.WEEK             // 604,800,000ms (7 days)
```

### Creating Cache Keys

```typescript
import { createCacheKey } from "@local/plugin-cache";

// Simple key
const key = createCacheKey("products");
// Result: "products"

// Key with parameters
const key = createCacheKey("products", { page: 1, limit: 10 });
// Result: "products:page=1&limit=10"
```

### Cache Control Methods

```typescript
// Disable caching (for --no-cache flag)
cache.disable();

// Re-enable caching
cache.enable();

// Get cache statistics
const stats = cache.getStats();
// { entries: 42, totalSize: 1234567, location: "~/.cache/plugin-cache" }

// Clear all cached data for this namespace
const entriesCleared = cache.clear();

// Invalidate specific key
cache.invalidate("my-cache-key");

// Invalidate by pattern
cache.invalidatePattern(/^products/);
```

### Bypass Cache for Specific Calls

```typescript
const data = await cache.getOrFetch(
  "my-key",
  () => fetchData(),
  { ttl: TTL.HOUR, bypassCache: true }
);
```

## Recommended TTLs by Data Type

| Data Type | TTL | Reason |
|-----------|-----|--------|
| Stock/inventory levels | 5 minutes | Critical for accuracy |
| Active orders/tickets | 5 minutes | Frequently changing |
| Product details | 15 minutes | Occasional updates |
| Customer profiles | 15 minutes | Moderate change rate |
| Campaign/flow reports | 5 minutes | Real-time analytics |
| Product catalog | 1 hour | Infrequent changes |
| Tax rates, settings | 24 hours | Rarely changes |
| Organisation info | 24 hours | Very static |
| Segments, lists | 1 hour | Relatively static |

## CLI Commands

Each plugin should expose these CLI commands:

```bash
# Show cache statistics
npx tsx cli.ts cache-stats

# Clear all cached data
npx tsx cli.ts cache-clear

# Invalidate specific key
npx tsx cli.ts cache-invalidate --key "my-cache-key"

# Bypass cache for a request
npx tsx cli.ts list-products --no-cache
```

## Global CLI

Manage cache across all plugins:

```bash
cd ~/.claude/plugins/local-marketplace/shared/cache
npx tsx cli.ts stats          # Global stats
npx tsx cli.ts cleanup        # Manual LRU cleanup
npx tsx cli.ts clear          # Clear everything
```

## Architecture

```
~/.cache/plugin-cache/
├── manifest.json           # Global manifest with size tracking
├── shopify-order-manager/  # Per-plugin directories
│   ├── products.json
│   ├── orders:page=1.json
│   └── ...
├── gorgias-support-manager/
│   └── ...
└── ...
```

### Cache Entry Format

```json
{
  "data": { ... },
  "cachedAt": 1704067200000,
  "ttl": 900000,
  "staleWhileRevalidate": 86400000,
  "namespace": "shopify-order-manager",
  "key": "products"
}
```

## Invalidation After Mutations

Always invalidate related cache entries after write operations:

```typescript
async createProduct(data: ProductData): Promise<Product> {
  const result = await this.callTool("create_product", data);

  // Invalidate products cache
  cache.invalidatePattern(/^products/);

  return result;
}
```

## Plugins Using This Library

- `shopify-order-manager` v1.1.0+
- `gorgias-support-manager` v1.1.0+
- `judgeme-review-manager` v1.1.0+
- `inflow-inventory-manager` v1.1.0+
- `airtable-manager` v1.1.0+
- `klaviyo-marketing-manager` v1.1.0+
- `xero-accounting-manager` v2.1.0+
