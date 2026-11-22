import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MissingApiKeyError, parseOutput } from "./errors";
import type { Llm } from "./llm";

const DEFAULT_MAX_TOKENS = 4096;

/** The slice of the SDK's `messages` resource this module uses, so tests can inject a fake. */
export interface MessagesClient {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<{
    content: { type: string; text?: string }[];
    usage: { input_tokens: number; output_tokens: number };
    stop_reason: string | null;
  }>;
}

export interface AnthropicLlmOptions {
  /** Checked on the first call, not here, so commands that never call the model need no key. */
  apiKey: string | undefined;
  makeClient?: (apiKey: string) => MessagesClient;
  now?: () => number;
}

/**
 * The live LLM: one Messages API call per extraction, using the API's native structured output
 * (`output_config.format`). Sampling parameters stay at API defaults.
 */
export function createAnthropicLlm({
  apiKey,
  makeClient = (key) => new Anthropic({ apiKey: key }).messages,
  now = () => performance.now(),
}: AnthropicLlmOptions): Llm {
  let client: MessagesClient | undefined;

  return {
    async extract(request) {
      if (!apiKey) throw new MissingApiKeyError();
      client ??= makeClient(apiKey);
      const { type, schema } = zodOutputFormat(request.schema);

      const started = now();
      const response = await client.create({
        model: request.model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        output_config: { format: { type, schema } },
      });
      const latencyMs = now() - started;

      const raw = response.content.map((block) => block.text ?? "").join("");
      return {
        value: parseOutput(raw, request.schema, request.schemaName, response.stop_reason),
        model: request.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        latencyMs,
      };
    },
  };
}
