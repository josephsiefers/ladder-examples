import type { z } from "zod";
import type { CallStats, Llm } from "../llm";

/** Dataset splits: iterate on dev, never tune against test, demo on smoke. */
export const SPLITS = ["smoke", "dev", "test"] as const;

export type Split = (typeof SPLITS)[number];

/** One gold-labelled case: the input to run, the gold value, and optional evidence paragraphs. */
export interface EvalCase<Input, Value> {
  id: string;
  split: Split;
  input: Input;
  gold: Value;
  /** Paragraph IDs (e.g. `7.1`) the gold value of each field comes from. */
  evidence?: Partial<Record<string, string[]>>;
}

export interface RunContext {
  /** The LLM to call; the runner records every call made through it. */
  llm: Llm;
  /** The run number, passed on as the LLM sample index. */
  sampleIndex: number;
}

/**
 * One eval: its cases' shape, how to run one case, and how to score an output against gold.
 * The output and the gold value share one type, so both are described the same way.
 */
export interface EvalDefinition<Input, Value> {
  name: string;
  /** The scored fields, in report order. */
  fields: readonly string[];
  inputSchema: z.ZodType<Input>;
  goldSchema: z.ZodType<Value>;
  run(input: Input, context: RunContext): Promise<Value>;
  /** Per field: does the output match gold? */
  score(output: Value, gold: Value): Record<string, boolean>;
  /** Per field: the value as one readable line, for the failures list. */
  describe(value: Value): Record<string, string>;
  /** The line saying whether the eval met its target, e.g. `term 96.3% → target 98%: NOT MET`. */
  target(stats: readonly FieldStats[]): string;
  /** The text of one of a case's evidence paragraphs, for the review sheet; undefined if it has none by that ID. */
  evidenceText(input: Input, paragraphId: string): Promise<string | undefined>;
}

/** The result of one (case, run) pair. A thrown error scores every field false. */
export interface CaseRun {
  caseId: string;
  /** 0-based; also the LLM sample index. */
  run: number;
  correct: Record<string, boolean>;
  expected: Record<string, string>;
  actual: Record<string, string>;
  output?: unknown;
  error?: string;
  calls: CallStats[];
}

/** Everything one eval run produced; saved as JSON under `reports/evals/`. */
export interface RunRecord {
  eval: string;
  split: Split;
  runs: number;
  concurrency: number;
  startedAt: string;
  wallTimeMs: number;
  fields: string[];
  caseIds: string[];
  /** Ordered by run, then case. */
  results: CaseRun[];
}

/** One field's accuracy (0..1) in each run, and across runs. Stdev is the population stdev. */
export interface FieldStats {
  field: string;
  perRun: number[];
  mean: number;
  stdev: number;
  min: number;
  max: number;
}
