import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InvalidOutputError } from "./errors";
import { createFakeLlm } from "./fake";

const REQUEST = {
  model: "claude-haiku-5-5",
  system: "Answer yes or no.",
  prompt: "Is the sky blue?",
  schema: z.object({ answer: z.enum(["yes", "no"]) }),
  schemaName: "yes-no",
} as const;

describe("fake LLM", () => {
  it("answers with the responder's value, validated, and records each request", async () => {
    const llm = createFakeLlm(() => ({ answer: "yes" }), {
      usage: { inputTokens: 10, outputTokens: 2 },
      latencyMs: 5,
    });

    const result = await llm.extract({ ...REQUEST, sampleIndex: 2 });

    expect(result).toEqual({
      value: { answer: "yes" },
      model: "claude-haiku-5-5",
      usage: { inputTokens: 10, outputTokens: 2 },
      latencyMs: 5,
      cached: false,
    });
    expect(llm.calls).toEqual([{ ...REQUEST, sampleIndex: 2 }]);
  });

  it("reports zero usage and latency by default", async () => {
    const result = await createFakeLlm(() => ({ answer: "no" })).extract(REQUEST);

    expect(result).toMatchObject({ usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 });
  });

  it("rejects a value that fails the schema, as the live LLM does", async () => {
    const llm = createFakeLlm(() => ({ answer: "maybe" }));

    await expect(llm.extract(REQUEST)).rejects.toThrow(InvalidOutputError);
    await expect(llm.extract(REQUEST)).rejects.toThrow('Raw output:\n{"answer":"maybe"}');
  });
});
