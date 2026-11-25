// UC2 Intake triage: routing by type. See docs/spec/use-cases/uc2-intake-triage.md.
export { createTriageEval, type TriageEvalInput, type TriageLabel } from "./eval";
export { queueFor, ROUTING_TABLE } from "./routing";
export { type Classification, DOC_TYPES, type DocType } from "./schema";
export {
  type TriageDeps,
  type TriageOptions,
  type TriageResult,
  triageAll,
  triageDocument,
} from "./triage";
