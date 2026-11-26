import { readFile } from "node:fs/promises";
import type { z } from "zod";

/**
 * Reads the JSON file at `path` and validates it against `schema`. On failure, throws an error
 * naming `label` (e.g. "plant spec nda-a.json") and each issue's path and message.
 */
export async function readJson<T>(path: string, schema: z.ZodType<T>, label: string): Promise<T> {
  const parsed = schema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid ${label}: ${issues.join("; ")}.`);
  }
  return parsed.data;
}
