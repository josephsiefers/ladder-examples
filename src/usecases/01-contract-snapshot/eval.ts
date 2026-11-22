import { z } from "zod";
import type { ContractReader } from "../../core/documents";
import { type EvalDefinition, type FieldStats, formatPercent } from "../../core/eval";
import { type ContractSnapshot, contractSnapshotSchema } from "./schema";
import { describeSnapshot, SNAPSHOT_FIELDS, scoreSnapshot } from "./score";
import { snapshotContract } from "./snapshot";

export interface SnapshotEvalInput {
  contractId: string;
}

/** UC1's target: effective date and term accuracy ≥ 98%, mean of the runs. */
const TARGET = 0.98;
const TARGET_FIELDS = ["effectiveDate", "term"] as const;

/** The target line, e.g. `effectiveDate 100.0% · term 96.3% → target 98%: NOT MET`. */
export function snapshotTarget(stats: readonly FieldStats[]): string {
  const means = TARGET_FIELDS.map((field) => ({
    field,
    mean: stats.find((stat) => stat.field === field)?.mean ?? 0,
  }));
  const met = means.every(({ mean }) => mean >= TARGET);
  const parts = means.map(({ field, mean }) => `${field} ${formatPercent(mean)}`).join(" · ");
  return `${parts} → target ${TARGET * 100}%: ${met ? "MET" : "NOT MET"}`;
}

/** The UC1 eval: snapshot each case's contract and score it field by field against gold. */
export function createSnapshotEval({
  documents,
}: {
  documents: ContractReader;
}): EvalDefinition<SnapshotEvalInput, ContractSnapshot> {
  return {
    name: "snapshot",
    fields: SNAPSHOT_FIELDS,
    inputSchema: z.object({ contractId: z.string().min(1) }),
    goldSchema: contractSnapshotSchema,
    async run({ contractId }, { llm, sampleIndex }) {
      const { snapshot } = await snapshotContract(contractId, { llm, documents }, { sampleIndex });
      return snapshot;
    },
    score: scoreSnapshot,
    describe: describeSnapshot,
    target: snapshotTarget,
  };
}
