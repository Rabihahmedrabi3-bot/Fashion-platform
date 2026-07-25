import { BadRequestError } from "./errors.js";

/**
 * Express types route params as `string | string[]` (Express 5 supports
 * wildcard params that yield arrays). None of this API's routes use
 * wildcards, so a param is always a single string in practice - this just
 * narrows the type and rejects the theoretical array case instead of
 * silently misbehaving.
 */
export function requireParam(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new BadRequestError(`missing or invalid route parameter: ${name}`);
  }
  return value;
}
