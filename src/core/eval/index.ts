// Reusable eval machinery: datasets, runner, stats, reports and review sheets. Evals call real models; tests never run them.
export { formatPercent, renderReport } from "./report";
export { buildReviewSheet, type ReviewSheet } from "./review-sheet";
export { DEFAULT_CONCURRENCY, DEFAULT_RUNS, runEval } from "./runner";
export {
  createEvalStore,
  EmptySplitError,
  type EvalStore,
  NoRunRecordError,
} from "./store";
export {
  type EvalDefinition,
  type FieldStats,
  type RunRecord,
  SPLITS,
  type Split,
} from "./types";
