// Reusable eval machinery: datasets, runner, stats and reports. Evals call real models; tests never run them.
export { formatPercent, renderReport } from "./report";
export { DEFAULT_CONCURRENCY, DEFAULT_RUNS, runEval } from "./runner";
export { createEvalStore, EmptySplitError, type EvalStore } from "./store";
export {
  type EvalDefinition,
  type FieldStats,
  type RunRecord,
  SPLITS,
  type Split,
} from "./types";
