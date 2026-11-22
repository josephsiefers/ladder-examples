import { type ContractReader, renderContractForPrompt } from "../../core/documents";
import { type CallStats, DEFAULT_MODEL, type Llm, type ModelId } from "../../core/llm";
import { SNAPSHOT_SYSTEM_PROMPT, snapshotUserPrompt } from "./prompts";
import {
  CONTRACT_SNAPSHOT_SCHEMA_NAME,
  type ContractSnapshot,
  contractSnapshotSchema,
} from "./schema";

export interface SnapshotDeps {
  llm: Llm;
  documents: ContractReader;
}

export interface SnapshotOptions {
  model?: ModelId;
  /** Which sample of a repeated snapshot this is (the eval run number). */
  sampleIndex?: number;
}

export interface SnapshotResult extends CallStats {
  snapshot: ContractSnapshot;
}

/** UC1: one contract in, one validated contract snapshot out, in a single LLM call. */
export async function snapshotContract(
  contractId: string,
  { llm, documents }: SnapshotDeps,
  { model = DEFAULT_MODEL, sampleIndex = 0 }: SnapshotOptions = {},
): Promise<SnapshotResult> {
  const contract = await documents.readContract(contractId);
  const { value, ...call } = await llm.extract({
    model,
    system: SNAPSHOT_SYSTEM_PROMPT,
    prompt: snapshotUserPrompt(renderContractForPrompt(contract)),
    schema: contractSnapshotSchema,
    schemaName: CONTRACT_SNAPSHOT_SCHEMA_NAME,
    sampleIndex,
  });
  return { snapshot: value, ...call };
}
