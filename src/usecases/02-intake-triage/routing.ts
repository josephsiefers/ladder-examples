import type { Queue } from "../../core/documents";
import type { DocType } from "./schema";

/**
 * The UC2 routing table, the one place to look up a document type's queue. Code, not the model,
 * decides the queue. `nda-review` is a stub until UC3.
 */
export const ROUTING_TABLE = {
  nda: "nda-review",
  msa: "commercial",
  sow: "commercial",
  dpa: "privacy",
  other: "senior-associate",
} as const satisfies Record<DocType, Queue>;
