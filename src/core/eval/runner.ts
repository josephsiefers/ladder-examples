import { type CallStats, type Llm, LlmCacheError } from "../llm";
import type { CaseRun, EvalCase, EvalDefinition, RunRecord, Split } from "./types";

export const DEFAULT_RUNS = 3;
export const DEFAULT_CONCURRENCY = 4;

export interface RunOptions {
  llm: Llm;
  split: Split;
  runs?: number;
  concurrency?: number;
  /** Monotonic milliseconds, for wall time. */
  now?: () => number;
  date?: () => Date;
}

/**
 * Runs every (case, run) pair exactly once, at most `concurrency` at a time, and scores each
 * output against gold. A thrown error becomes a failed case and never ends the eval, except an
 * LLM cache error (a replay-only miss or a corrupt entry), which is a setup problem and does.
 */
export async function runEval<Input, Value>(
  definition: EvalDefinition<Input, Value>,
  cases: readonly EvalCase<Input, Value>[],
  {
    llm,
    split,
    runs = DEFAULT_RUNS,
    concurrency = DEFAULT_CONCURRENCY,
    now = () => performance.now(),
    date = () => new Date(),
  }: RunOptions,
): Promise<RunRecord> {
  const startedAt = date().toISOString();
  const started = now();
  const pairs = Array.from({ length: runs }, (_, run) =>
    cases.map((evalCase) => ({ evalCase, run })),
  ).flat();
  const results: CaseRun[] = Array.from({ length: pairs.length });

  let next = 0;
  async function worker(): Promise<void> {
    while (next < pairs.length) {
      const index = next++;
      const pair = pairs[index];
      if (pair) results[index] = await runPair(definition, pair.evalCase, pair.run, llm);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pairs.length) }, worker));

  return {
    eval: definition.name,
    split,
    runs,
    concurrency,
    startedAt,
    wallTimeMs: now() - started,
    fields: [...definition.fields],
    caseIds: cases.map((evalCase) => evalCase.id),
    results,
  };
}

async function runPair<Input, Value>(
  definition: EvalDefinition<Input, Value>,
  evalCase: EvalCase<Input, Value>,
  run: number,
  llm: Llm,
): Promise<CaseRun> {
  const calls: CallStats[] = [];
  const recording: Llm = {
    async extract(request) {
      const { value, ...stats } = await llm.extract(request);
      calls.push(stats);
      return { value, ...stats };
    },
  };
  const expected = definition.describe(evalCase.gold);
  const base = { caseId: evalCase.id, run, expected, calls };

  try {
    const output = await definition.run(evalCase.input, { llm: recording, sampleIndex: run });
    return {
      ...base,
      correct: definition.score(output, evalCase.gold),
      actual: definition.describe(output),
      output,
    };
  } catch (error) {
    if (error instanceof LlmCacheError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const shown = `error: ${message.split("\n")[0]}`;
    const everyField = <T>(value: T) =>
      Object.fromEntries(definition.fields.map((field) => [field, value]));
    return { ...base, correct: everyField(false), actual: everyField(shown), error: message };
  }
}
