import { describe, expect, it } from "vitest";
import { type CacheKeyFields, cacheKey } from "./cache-key";

const FIELDS: CacheKeyFields = {
  model: "claude-haiku-5-5",
  system: "Answer yes or no.",
  prompt: "Is the sky blue?",
  schemaName: "yes-no",
  jsonSchema: {
    type: "object",
    properties: { answer: { enum: ["yes", "no"] } },
    required: ["answer"],
  },
  maxTokens: 4096,
  sampleIndex: 0,
};

describe("cacheKey", () => {
  it("is the SHA-256 hex digest of the fields", () => {
    expect(cacheKey(FIELDS)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable when object keys are reordered, at any depth", () => {
    const reordered: CacheKeyFields = {
      sampleIndex: 0,
      maxTokens: 4096,
      jsonSchema: {
        required: ["answer"],
        properties: { answer: { enum: ["yes", "no"] } },
        type: "object",
      },
      schemaName: "yes-no",
      prompt: "Is the sky blue?",
      system: "Answer yes or no.",
      model: "claude-haiku-5-5",
    };

    expect(cacheKey(reordered)).toBe(cacheKey(FIELDS));
  });

  it.each<[string, Partial<CacheKeyFields>]>([
    ["model", { model: "claude-sonnet-5-5" }],
    ["system prompt", { system: "Answer no or yes." }],
    ["user prompt", { prompt: "Is the sea blue?" }],
    ["schema name", { schemaName: "yes-no-v2" }],
    ["JSON schema", { jsonSchema: { type: "object", properties: {} } }],
    ["max tokens", { maxTokens: 300 }],
    ["sample index", { sampleIndex: 1 }],
  ])("changes when the %s changes", (_, change) => {
    expect(cacheKey({ ...FIELDS, ...change })).not.toBe(cacheKey(FIELDS));
  });

  // The digest of the sorted-key JSON, computed independently with `shasum -a 256`.
  it("matches a known digest, so committed entries stay addressable", () => {
    expect(cacheKey({ ...FIELDS, jsonSchema: { type: "object" }, prompt: "p", system: "s" })).toBe(
      "7891dcea402031859cae5f02cc5f4a4155088c43927944de69f15402adfb69c1",
    );
  });
});
