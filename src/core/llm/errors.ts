import type { z } from "zod";

/** The model's output is not valid JSON or does not match the schema. Never retried silently. */
export class InvalidOutputError extends Error {
  override name = "InvalidOutputError";

  constructor(
    readonly schemaName: string,
    readonly raw: string,
    detail: string,
  ) {
    super(`Model output does not match schema '${schemaName}': ${detail}.\nRaw output:\n${raw}`);
  }
}

/** A live call was needed but no API key is configured. */
export class MissingApiKeyError extends Error {
  override name = "MissingApiKeyError";

  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Export it in your shell or add `export ANTHROPIC_API_KEY=...` to .envrc.",
    );
  }
}

/** The LLM cache cannot answer: a setup problem, not model behaviour, so an eval stops on it. */
export class LlmCacheError extends Error {
  override name = "LlmCacheError";
}

/** Replay-only mode needed an entry the cache does not hold. */
export class CacheMissError extends LlmCacheError {
  override name = "CacheMissError";

  constructor(
    keyFieldsDescription: string,
    readonly key: string,
  ) {
    super(
      `No cached LLM call for ${keyFieldsDescription} (key ${key}). Run without --replay-only to record it.`,
    );
  }
}

/** A cache entry exists but cannot be replayed. Never treated as a miss. */
export class CorruptCacheEntryError extends LlmCacheError {
  override name = "CorruptCacheEntryError";

  constructor(
    readonly file: string,
    detail: string,
  ) {
    super(`Corrupt LLM cache entry ${file}: ${detail}. Delete it, or re-record it with --live.`);
  }
}

/** `path: message; …` for each issue, naming the root as `(root)`. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** Parses raw model output as JSON and validates it against `schema`, or throws `InvalidOutputError`. */
export function parseOutput<T>(
  raw: string,
  schema: z.ZodType<T>,
  schemaName: string,
  stopReason?: string | null,
): T {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    const suffix = stopReason ? ` (stop reason: ${stopReason})` : "";
    throw new InvalidOutputError(schemaName, raw, `not valid JSON${suffix}`);
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new InvalidOutputError(schemaName, raw, formatIssues(result.error));
  return result.data;
}
