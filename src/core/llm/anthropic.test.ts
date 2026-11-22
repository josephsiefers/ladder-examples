import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAnthropicLlm, type MessagesClient } from "./anthropic";
import { InvalidOutputError, MissingApiKeyError } from "./errors";

const YES_NO = z.object({ answer: z.enum(["yes", "no"]) });

const REQUEST = {
  model: "claude-haiku-5-5",
  system: "Answer yes or no.",
  prompt: "Is the sky blue?",
  schema: YES_NO,
  schemaName: "yes-no",
} as const;

type Reply = Awaited<ReturnType<MessagesClient["create"]>>;

function reply(text: string, overrides: Partial<Reply> = {}): Reply {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 1234, output_tokens: 56 },
    stop_reason: "end_turn",
    ...overrides,
  };
}

/** A fake SDK client that answers every request with `response`, plus a clock that ticks 850 ms per read. */
function setUp(response: Reply) {
  const create = vi.fn<MessagesClient["create"]>(async () => response);
  let tick = 1000;
  const llm = createAnthropicLlm({
    apiKey: "test-key",
    makeClient: () => ({ create }),
    now: () => (tick += 850) - 850,
  });
  return { llm, create };
}

describe("Anthropic LLM", () => {
  it("sends the model, system prompt, user prompt and JSON schema as native structured output", async () => {
    const { llm, create } = setUp(reply('{"answer":"yes"}'));

    await llm.extract(REQUEST);

    expect(create).toHaveBeenCalledExactlyOnceWith({
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      system: "Answer yes or no.",
      messages: [{ role: "user", content: "Is the sky blue?" }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { answer: { enum: ["yes", "no"] } },
            required: ["answer"],
            additionalProperties: false,
          },
        },
      },
    });
  });

  it("passes a requested max tokens through", async () => {
    const { llm, create } = setUp(reply('{"answer":"yes"}'));

    await llm.extract({ ...REQUEST, maxTokens: 300 });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 300 }));
  });

  it("returns the validated value with the model, token usage and latency, marked live", async () => {
    const { llm } = setUp(reply('{"answer":"no"}'));

    const result = await llm.extract(REQUEST);

    expect(result).toEqual({
      value: { answer: "no" },
      model: "claude-haiku-5-5",
      usage: { inputTokens: 1234, outputTokens: 56 },
      latencyMs: 850,
      cached: false,
    });
  });

  it("joins the text blocks of the response, skipping other blocks, before parsing", async () => {
    const { llm } = setUp(
      reply("", {
        content: [
          { type: "text", text: '{"answer":' },
          { type: "thinking" },
          { type: "text", text: '"yes"}' },
        ],
      }),
    );

    await expect(llm.extract(REQUEST)).resolves.toMatchObject({ value: { answer: "yes" } });
  });

  it("rejects output that fails the schema, listing each issue and quoting the raw output", async () => {
    const raw = '{"answer":"maybe","detail":{"count":"x"}}';
    const { llm } = setUp(reply(raw));

    const extract = llm.extract({
      ...REQUEST,
      schema: YES_NO.extend({ detail: z.object({ count: z.number() }) }),
    });

    await expect(extract).rejects.toThrow(InvalidOutputError);
    await expect(extract).rejects.toMatchObject({
      name: "InvalidOutputError",
      raw,
      message:
        "Model output does not match schema 'yes-no': " +
        'answer: Invalid option: expected one of "yes"|"no"; ' +
        "detail.count: Invalid input: expected number, received string.\n" +
        `Raw output:\n${raw}`,
    });
  });

  it("names the root when the whole output has the wrong shape", async () => {
    const { llm } = setUp(reply("[]"));

    await expect(llm.extract(REQUEST)).rejects.toThrow(
      "'yes-no': (root): Invalid input: expected object, received array.",
    );
  });

  it("rejects output that is not JSON, naming the stop reason", async () => {
    const { llm } = setUp(reply('{"answer":', { stop_reason: "max_tokens" }));

    const extract = llm.extract(REQUEST);

    await expect(extract).rejects.toThrow(InvalidOutputError);
    await expect(extract).rejects.toThrow(
      "Model output does not match schema 'yes-no': not valid JSON (stop reason: max_tokens).",
    );
  });

  it("rejects output that is not JSON without a stop reason when there is none", async () => {
    const { llm } = setUp(reply("nope", { stop_reason: null }));

    await expect(llm.extract(REQUEST)).rejects.toThrow(
      "Model output does not match schema 'yes-no': not valid JSON.\nRaw output:\nnope",
    );
  });

  it("calls the API once, with no retry, when the output is invalid", async () => {
    const { llm, create } = setUp(reply("not json"));

    await expect(llm.extract(REQUEST)).rejects.toThrow(InvalidOutputError);

    expect(create).toHaveBeenCalledOnce();
  });

  it.each([undefined, ""])(
    "explains a missing API key (%j) without calling the API",
    async (key) => {
      const makeClient = vi.fn<(apiKey: string) => MessagesClient>();
      const llm = createAnthropicLlm({ apiKey: key, makeClient });

      const extract = llm.extract(REQUEST);

      await expect(extract).rejects.toThrow(MissingApiKeyError);
      await expect(extract).rejects.toMatchObject({ name: "MissingApiKeyError" });
      await expect(extract).rejects.toThrow(
        "ANTHROPIC_API_KEY is not set. Export it in your shell or add `export ANTHROPIC_API_KEY=...` to .envrc.",
      );
      expect(makeClient).not.toHaveBeenCalled();
    },
  );

  it("creates the SDK client once, with the API key", async () => {
    const create = vi.fn<MessagesClient["create"]>(async () => reply('{"answer":"yes"}'));
    const makeClient = vi.fn<(apiKey: string) => MessagesClient>(() => ({ create }));
    const llm = createAnthropicLlm({ apiKey: "sk-test", makeClient });

    await llm.extract(REQUEST);
    await llm.extract(REQUEST);

    expect(makeClient).toHaveBeenCalledExactlyOnceWith("sk-test");
  });
});
