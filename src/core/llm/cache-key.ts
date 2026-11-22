import { createHash } from "node:crypto";
import { z } from "zod";
import { MODELS } from "./models";

/** Everything that decides a call's output, so everything the cache key covers. */
export const cacheKeyFieldsSchema = z.object({
  model: z.enum(MODELS),
  system: z.string(),
  prompt: z.string(),
  schemaName: z.string(),
  /** The JSON schema exactly as sent to the API. */
  jsonSchema: z.unknown(),
  maxTokens: z.number(),
  /** The eval run number (0 for single calls), so each run is its own sample, not a replay of run 0. */
  sampleIndex: z.number(),
});

export type CacheKeyFields = z.infer<typeof cacheKeyFieldsSchema>;

/** The SHA-256 hex digest of the fields as canonical JSON (object keys sorted at every depth). */
export function cacheKey(fields: CacheKeyFields): string {
  return createHash("sha256").update(canonicalJson(fields)).digest("hex");
}

/** JSON with every object's keys in code-unit order, so key order never changes the hash. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, nested: unknown) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) return nested;
    const object = nested as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .toSorted()
        .map((key) => [key, object[key]]),
    );
  });
}
