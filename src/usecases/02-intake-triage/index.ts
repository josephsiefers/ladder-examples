// UC2 Intake triage: routing by type. See docs/spec/use-cases/uc2-intake-triage.md.
export { createTriageEval, type TriageEvalInput, type TriageLabel } from "./eval";
export { ROUTING_TABLE } from "./routing";
export type { Classification } from "./schema";
export {
  type TriageDeps,
  type TriageOptions,
  type TriageResult,
  triageAll,
  triageDocument,
} from "./triage";
