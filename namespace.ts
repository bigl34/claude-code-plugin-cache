import * as path from "path";

const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export function validateCacheNamespace(namespace: string): string {
  if (typeof namespace !== "string" || namespace.length === 0) {
    throw new Error("Cache namespace must be a non-empty string");
  }
  if (
    namespace === "." ||
    namespace === ".." ||
    namespace.includes("..") ||
    namespace.includes("/") ||
    namespace.includes("\\") ||
    path.isAbsolute(namespace) ||
    /^[a-zA-Z]:/.test(namespace) ||
    !NAMESPACE_PATTERN.test(namespace)
  ) {
    throw new Error(
      `Invalid cache namespace "${namespace}". Use letters, numbers, dot, underscore, or hyphen; path segments are not allowed.`,
    );
  }
  return namespace;
}

export function resolveCachePath(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, ...segments);
  if (!isPathInsideRoot(resolvedRoot, resolvedPath)) {
    throw new Error(`Resolved cache path escapes cache root: ${resolvedPath}`);
  }
  return resolvedPath;
}

export function isPathInsideRoot(root: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
