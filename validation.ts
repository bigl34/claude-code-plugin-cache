
import { CacheValidator } from "./types";

export function buildConditionalHeaders(
  validator: CacheValidator | null
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (!validator) {
    return headers;
  }

  if (validator.etag) {
    headers["If-None-Match"] = validator.etag;
  }

  if (validator.lastModified) {
    headers["If-Modified-Since"] = validator.lastModified;
  }

  return headers;
}

export function extractValidator(
  headers: Headers | Record<string, string> | Map<string, string>
): CacheValidator {
  const validator: CacheValidator = {};

  let etag: string | null = null;
  let lastModified: string | null = null;

  if (headers instanceof Headers) {
    etag = headers.get("etag") || headers.get("ETag");
    lastModified = headers.get("last-modified") || headers.get("Last-Modified");
  } else if (headers instanceof Map) {
    etag = headers.get("etag") || headers.get("ETag") || null;
    lastModified = headers.get("last-modified") || headers.get("Last-Modified") || null;
  } else {
    etag = headers["etag"] || headers["ETag"] || null;
    lastModified = headers["last-modified"] || headers["Last-Modified"] || null;
  }

  if (etag) {
    validator.etag = etag;
  }

  if (lastModified) {
    validator.lastModified = lastModified;
  }

  return validator;
}

export function isNotModified(status: number): boolean {
  return status === 304;
}

export async function conditionalFetch<T>(options: {
  url: string;
  validator: CacheValidator | null;
  fetcher: (headers: Record<string, string>) => Promise<{
    status: number;
    data: T;
    headers: Headers | Record<string, string>;
  }>;
  cachedData: T | null;
}): Promise<{
  data: T;
  notModified: boolean;
  newValidator: CacheValidator;
}> {
  const conditionalHeaders = buildConditionalHeaders(options.validator);
  const response = await options.fetcher(conditionalHeaders);

  if (isNotModified(response.status) && options.cachedData !== null) {
    return {
      data: options.cachedData,
      notModified: true,
      newValidator: options.validator || {},
    };
  }

  return {
    data: response.data,
    notModified: false,
    newValidator: extractValidator(response.headers),
  };
}

export function createCacheKey(
  baseKey: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  if (!params || Object.keys(params).length === 0) {
    return baseKey;
  }

  const sortedParams = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return sortedParams ? `${baseKey}?${sortedParams}` : baseKey;
}

export function parseCacheKey(key: string): {
  base: string;
  params: Record<string, string>;
} {
  const [base, queryString] = key.split("?");
  const params: Record<string, string> = {};

  if (queryString) {
    for (const pair of queryString.split("&")) {
      const [k, v] = pair.split("=");
      if (k && v !== undefined) {
        params[k] = v;
      }
    }
  }

  return { base, params };
}
