import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/** Max tokens when a request names none. */
export const DEFAULT_MAX_TOKENS = 4096;

/** The JSON schema the API receives for `schema`, shared by the live call and the cache key. */
export function outputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return zodOutputFormat(schema).schema;
}
