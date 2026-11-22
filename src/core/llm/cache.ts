import { z } from "zod";
import { type CacheKeyFields, cacheKey, cacheKeyFieldsSchema } from "./cache-key";
import type { CacheStore } from "./cache-store";
import { CacheMissError, CorruptCacheEntryError, formatIssues } from "./errors";
import type { Llm, StructuredRequest, StructuredResult, Usage } from "./llm";
import { DEFAULT_MAX_TOKENS, outputJsonSchema } from "./request";

/**
 * - `read-through`: replay a hit; on a miss, call live and record.
 * - `live`: always call live and overwrite the entry.
 * - `replay-only`: replay a hit; a miss is an error, so no API key is needed.
 */
export const CACHE_MODES = ["read-through", "live", "replay-only"] as const;

export type CacheMode = (typeof CACHE_MODES)[number];

export interface CachedLlmOptions {
  mode?: CacheMode;
  store: CacheStore;
  date?: () => Date;
}

/** One recorded call: what was asked (the key fields), the validated value, and what it cost. */
interface CacheEntry {
  key: CacheKeyFields;
  value: unknown;
  usage: Usage;
  latencyMs: number;
  recordedAt: string;
}

const entrySchema = z.object({
  key: cacheKeyFieldsSchema,
  value: z.unknown(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  latencyMs: z.number(),
  recordedAt: z.string(),
});

/**
 * Wraps `llm` so each call is recorded on disk and replayed on a repeat. A hit reports the
 * original call's usage and latency, so cost and latency reports stay meaningful on replay.
 */
export function createCachedLlm(
  llm: Llm,
  { mode = "read-through", store, date = () => new Date() }: CachedLlmOptions,
): Llm {
  return {
    async extract<T>(request: StructuredRequest<T>) {
      const fields = keyFields(request);
      const key = cacheKey(fields);
      if (mode !== "live") {
        const hit = await replay(store, key, request);
        if (hit) return hit;
        if (mode === "replay-only") throw new CacheMissError(describeKeyFields(fields), key);
      }

      const result = await llm.extract(request);
      const entry: CacheEntry = {
        key: fields,
        value: result.value,
        usage: result.usage,
        latencyMs: result.latencyMs,
        recordedAt: date().toISOString(),
      };
      // Serialised before the store is touched, so a value that cannot be serialised writes nothing.
      await store.write(key, `${JSON.stringify(entry, null, 2)}\n`);
      return result;
    },
  };
}

function keyFields(request: StructuredRequest<unknown>): CacheKeyFields {
  return {
    model: request.model,
    system: request.system,
    prompt: request.prompt,
    schemaName: request.schemaName,
    jsonSchema: outputJsonSchema(request.schema),
    maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    sampleIndex: request.sampleIndex ?? 0,
  };
}

/** The entry under `key` as a result, or undefined when there is none. Anything unreadable throws. */
async function replay<T>(
  store: CacheStore,
  key: string,
  request: StructuredRequest<T>,
): Promise<StructuredResult<T> | undefined> {
  const raw = await store.read(key);
  if (raw === undefined) return undefined;

  const corrupt = (detail: string) => new CorruptCacheEntryError(store.locate(key), detail);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw corrupt("not valid JSON");
  }
  const entry = entrySchema.safeParse(json);
  if (!entry.success) throw corrupt(formatIssues(entry.error));
  if (cacheKey(entry.data.key) !== key)
    throw corrupt("its key fields do not hash to its file name");
  const value = request.schema.safeParse(entry.data.value);
  if (!value.success) {
    throw corrupt(
      `value does not match schema '${request.schemaName}': ${formatIssues(value.error)}`,
    );
  }

  return {
    value: value.data,
    model: request.model,
    usage: entry.data.usage,
    latencyMs: entry.data.latencyMs,
    cached: true,
  };
}

/** A prompt quoted for an error message, cut short after 60 characters. */
const excerpt = (text: string) => JSON.stringify(text.length > 60 ? `${text.slice(0, 60)}…` : text);

/** The key fields as one line for errors, with long prompts cut short. */
function describeKeyFields(key: CacheKeyFields): string {
  return [
    `model ${key.model}`,
    `schema ${key.schemaName}`,
    `sample index ${key.sampleIndex}`,
    `max tokens ${key.maxTokens}`,
    `system ${excerpt(key.system)}`,
    `prompt ${excerpt(key.prompt)}`,
  ].join(" · ");
}
