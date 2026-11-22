import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFakeLlm, type StructuredRequest } from "../llm";
import { runEval } from "./runner";
import type { EvalCase, EvalDefinition } from "./types";

const valueSchema = z.object({ colour: z.string(), size: z.number() });
type Toy = z.infer<typeof valueSchema>;

/** A toy eval: each case's input is sent as the prompt; the model's answer is the output. */
function toyEval(overrides: Partial<EvalDefinition<{ text: string }, Toy>> = {}) {
  const definition: EvalDefinition<{ text: string }, Toy> = {
    name: "toy",
    fields: ["colour", "size"],
    inputSchema: z.object({ text: z.string() }),
    goldSchema: valueSchema,
    async run(input, { llm, sampleIndex }) {
      const { value } = await llm.extract({
        model: "claude-haiku-5-5",
        system: "toy",
        prompt: input.text,
        schema: valueSchema,
        schemaName: "toy",
        sampleIndex,
      });
      return value;
    },
    score: (output, gold) => ({
      colour: output.colour === gold.colour,
      size: output.size === gold.size,
    }),
    describe: (value) => ({ colour: value.colour, size: String(value.size) }),
    target: () => "no target",
    ...overrides,
  };
  return definition;
}

const gold: Toy = { colour: "red", size: 3 };
const cases: EvalCase<{ text: string }, Toy>[] = ["a", "b", "c"].map((id) => ({
  id,
  split: "smoke",
  input: { text: id },
  gold,
}));

describe("runEval", () => {
  it("runs every (case, run) pair exactly once, passing the run number as the sample index", async () => {
    const llm = createFakeLlm(() => gold);

    await runEval(toyEval(), cases, { llm, split: "smoke", runs: 3 });

    const pairs = llm.calls.map((call) => `${call.prompt}#${call.sampleIndex}`).toSorted();
    expect(pairs).toEqual(["a#0", "a#1", "a#2", "b#0", "b#1", "b#2", "c#0", "c#1", "c#2"]);
  });

  it("scores each output against gold, ordered by run then case", async () => {
    const llm = createFakeLlm((request) =>
      request.prompt === "b" ? { colour: "blue", size: 3 } : gold,
    );

    const record = await runEval(toyEval(), cases, { llm, split: "smoke", runs: 2 });

    expect(record.results.map((result) => [result.run, result.caseId])).toEqual([
      [0, "a"],
      [0, "b"],
      [0, "c"],
      [1, "a"],
      [1, "b"],
      [1, "c"],
    ]);
    expect(record.results[1]).toMatchObject({
      caseId: "b",
      correct: { colour: false, size: true },
      expected: { colour: "red", size: "3" },
      actual: { colour: "blue", size: "3" },
      output: { colour: "blue", size: 3 },
    });
    expect(record.results[0]?.correct).toEqual({ colour: true, size: true });
    expect(record.results[0]?.error).toBeUndefined();
  });

  it("never runs more pairs at once than the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const llm = createFakeLlm(() => gold);
    const definition = toyEval({
      async run(input, context) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return toyEval().run(input, context);
      },
    });

    await runEval(definition, cases, { llm, split: "smoke", runs: 3, concurrency: 2 });

    expect(peak).toBe(2);
    expect(llm.calls).toHaveLength(9);
  });

  it("runs 4 pairs at once by default", async () => {
    let inFlight = 0;
    let peak = 0;
    const definition = toyEval({
      async run() {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return gold;
      },
    });

    const record = await runEval(definition, cases, {
      llm: createFakeLlm(() => gold),
      split: "smoke",
      runs: 3,
    });

    expect(peak).toBe(4);
    expect(record.concurrency).toBe(4);
  });

  it("turns a thrown error into a failed case and carries on", async () => {
    const llm = createFakeLlm((request: StructuredRequest<unknown>) =>
      request.prompt === "b" && request.sampleIndex === 1 ? { colour: 7 } : gold,
    );

    const record = await runEval(toyEval(), cases, { llm, split: "smoke", runs: 2 });

    const failed = record.results.find((result) => result.caseId === "b" && result.run === 1);
    expect(failed).toMatchObject({
      correct: { colour: false, size: false },
      expected: { colour: "red", size: "3" },
      actual: {
        colour:
          "error: Model output does not match schema 'toy': colour: Invalid input: expected string, received number; size: Invalid input: expected number, received undefined.",
        size: "error: Model output does not match schema 'toy': colour: Invalid input: expected string, received number; size: Invalid input: expected number, received undefined.",
      },
      calls: [],
    });
    expect(failed?.error).toContain('Raw output:\n{"colour":7}');
    expect(failed?.output).toBeUndefined();
    expect(record.results.filter((result) => result.error)).toHaveLength(1);
  });

  it("records the model, usage and latency of every call", async () => {
    const llm = createFakeLlm(() => gold, {
      usage: { inputTokens: 1000, outputTokens: 50 },
      latencyMs: 1200,
    });
    const twice = toyEval({
      async run(input, context) {
        await toyEval().run(input, context);
        return toyEval().run(input, context);
      },
    });

    const record = await runEval(twice, cases.slice(0, 1), { llm, split: "smoke", runs: 1 });

    const call = { model: "claude-haiku-5-5", usage: { inputTokens: 1000, outputTokens: 50 } };
    expect(record.results[0]?.calls).toEqual([
      { ...call, latencyMs: 1200 },
      { ...call, latencyMs: 1200 },
    ]);
  });

  it("describes the run: eval, split, runs, concurrency, fields, cases, start and wall time", async () => {
    const ticks = [1000, 4500];
    const record = await runEval(toyEval(), cases, {
      llm: createFakeLlm(() => gold),
      runs: 1,
      concurrency: 3,
      split: "smoke",
      now: () => ticks.shift() ?? 0,
      date: () => new Date("2026-11-22T09:00:00.000Z"),
    });

    expect(record).toMatchObject({
      eval: "toy",
      split: "smoke",
      runs: 1,
      concurrency: 3,
      startedAt: "2026-11-22T09:00:00.000Z",
      wallTimeMs: 3500,
      fields: ["colour", "size"],
      caseIds: ["a", "b", "c"],
    });
  });
});
