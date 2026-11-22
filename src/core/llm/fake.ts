import { parseOutput } from "./errors";
import type { Llm, StructuredRequest, Usage } from "./llm";

export interface FakeLlm extends Llm {
  /** Every request received, in order. */
  readonly calls: StructuredRequest<unknown>[];
}

/**
 * An offline LLM for tests. `respond` plays the model: whatever it returns is serialised and then
 * validated exactly as live output is, so an invalid value raises `InvalidOutputError`.
 */
export function createFakeLlm(
  respond: (request: StructuredRequest<unknown>) => unknown,
  {
    usage = { inputTokens: 0, outputTokens: 0 },
    latencyMs = 0,
  }: { usage?: Usage; latencyMs?: number } = {},
): FakeLlm {
  const calls: StructuredRequest<unknown>[] = [];
  return {
    calls,
    async extract(request) {
      calls.push(request);
      const raw = JSON.stringify(respond(request));
      return {
        value: parseOutput(raw, request.schema, request.schemaName),
        model: request.model,
        usage,
        latencyMs,
        cached: false,
      };
    },
  };
}
