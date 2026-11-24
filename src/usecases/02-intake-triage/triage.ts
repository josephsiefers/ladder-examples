import {
  type IntakeDesk,
  type Queue,
  type RoutingReceipt,
  renderIntakeForPrompt,
} from "../../core/documents";
import { type CallStats, DEFAULT_MODEL, type Llm, type ModelId } from "../../core/llm";
import { TRIAGE_SYSTEM_PROMPT, triageUserPrompt } from "./prompts";
import { queueFor } from "./routing";
import { CLASSIFICATION_SCHEMA_NAME, type Classification, classificationSchema } from "./schema";

export interface TriageDeps {
  llm: Llm;
  documents: IntakeDesk;
}

export interface TriageOptions {
  /** File the document in its queue. Off by default: triage then only classifies. */
  route?: boolean;
  model?: ModelId;
  /** Which sample of a repeated triage this is (the eval run number). */
  sampleIndex?: number;
}

export interface TriageResult extends CallStats {
  documentId: string;
  classification: Classification;
  /** Always from the routing table, never from model output. */
  queue: Queue;
  /** Present only when the document was routed. */
  receipt?: RoutingReceipt;
}

/** UC2: classify one intake document's document type, then (if asked) route it by the table. */
export async function triageDocument(
  documentId: string,
  { llm, documents }: TriageDeps,
  { route = false, model = DEFAULT_MODEL, sampleIndex = 0 }: TriageOptions = {},
): Promise<TriageResult> {
  const document = await documents.readIntake(documentId);
  const { value: classification, ...call } = await llm.extract({
    model,
    system: TRIAGE_SYSTEM_PROMPT,
    prompt: triageUserPrompt(renderIntakeForPrompt(document)),
    schema: classificationSchema,
    schemaName: CLASSIFICATION_SCHEMA_NAME,
    sampleIndex,
  });
  const queue = queueFor(classification.docType);
  const receipt = route
    ? await documents.routeToQueue({ documentId, queue, rationale: classification.rationale })
    : undefined;
  return { documentId, classification, queue, ...(receipt && { receipt }), ...call };
}

/** Triages every intake document in the firm, one at a time, in ID order. */
export async function triageAll(
  deps: TriageDeps,
  options: TriageOptions = {},
): Promise<TriageResult[]> {
  const results: TriageResult[] = [];
  for (const documentId of await deps.documents.listIntake()) {
    results.push(await triageDocument(documentId, deps, options));
  }
  return results;
}
