// Reusable eval machinery: datasets, runner, stats, reports and review sheets. Evals call real models; tests never run them.
export {
  accuracy,
  accuracyByGroup,
  type ClassMetrics,
  type ConfusionMatrix,
  classMetrics,
  confusionMatrix,
  formatRate,
  type Prediction,
  renderConfusionMatrix,
} from "./classification";
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
  type EvalCase,
  type EvalDefinition,
  type FieldStats,
  type ReviewSheetLayout,
  type RunRecord,
  SPLITS,
  type Split,
} from "./types";
