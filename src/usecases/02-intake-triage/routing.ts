import type { Queue } from "../../core/documents";
import type { DocType } from "./schema";

/** The UC2 routing table. Code, not the model, decides the queue. `nda-review` is a stub until UC3. */
export const ROUTING_TABLE = {
  nda: "nda-review",
  msa: "commercial",
  sow: "commercial",
  dpa: "privacy",
  other: "senior-associate",
} as const satisfies Record<DocType, Queue>;

/** The queue a document type is routed to. */
export function queueFor(docType: DocType): Queue {
  return ROUTING_TABLE[docType];
}
