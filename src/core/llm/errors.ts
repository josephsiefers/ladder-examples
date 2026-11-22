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
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new InvalidOutputError(schemaName, raw, issues.join("; "));
  }
  return result.data;
}
