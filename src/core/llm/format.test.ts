import { describe, expect, it } from "vitest";
import { formatCallSummary } from "./format";

describe("formatCallSummary", () => {
  it("shows the model, input and output tokens, and latency in seconds", () => {
    expect(
      formatCallSummary({
        model: "claude-haiku-5-5",
        usage: { inputTokens: 12345, outputTokens: 678 },
        latencyMs: 1834.6,
        cached: false,
      }),
    ).toBe("model claude-haiku-5-5 · 12,345 input tokens · 678 output tokens · 1.83 s");
  });

  it("says when the call was replayed from the cache", () => {
    expect(
      formatCallSummary({
        model: "claude-haiku-5-5",
        usage: { inputTokens: 12345, outputTokens: 678 },
        latencyMs: 1834.6,
        cached: true,
      }),
    ).toBe("model claude-haiku-5-5 · 12,345 input tokens · 678 output tokens · 1.83 s · cached");
  });
});
