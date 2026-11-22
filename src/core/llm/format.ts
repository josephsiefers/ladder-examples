import type { CallStats } from "./llm";

const count = new Intl.NumberFormat("en-GB");

/** One line describing a call: model, input/output tokens and latency. */
export function formatCallSummary({ model, usage, latencyMs }: CallStats): string {
  return [
    `model ${model}`,
    `${count.format(usage.inputTokens)} input tokens`,
    `${count.format(usage.outputTokens)} output tokens`,
    `${(latencyMs / 1000).toFixed(2)} s`,
  ].join(" · ");
}
