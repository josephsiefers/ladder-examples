import {
  type IntakeDesk,
  type IntakeDocument,
  IntakeNotFoundError,
  withMemoryQueues,
} from "../../core/documents";

/** A hybrid: an MSA with a confidentiality section. */
export const MSA_WITH_CONFIDENTIALITY: IntakeDocument = {
  id: "intake-msa",
  title: "Master Services Agreement",
  paragraphs: [
    { id: "1.1", text: "The Supplier will provide software services under statements of work." },
    { id: "5.1", text: "Each party shall keep the other's Confidential Information confidential." },
  ],
};

const LETTER: IntakeDocument = {
  id: "intake-letter",
  title: "Letter of Intent",
  paragraphs: [{ text: "Dear Sirs, we propose to acquire your business." }],
};

/** An in-memory intake desk holding two documents; routing records are kept in `routed`. */
export function createFakeIntakeDesk() {
  const documents = [LETTER, MSA_WITH_CONFIDENTIALITY];
  const ids = documents.map((document) => document.id);
  const desk: IntakeDesk = {
    async listIntake() {
      return ids;
    },
    async readIntake(id) {
      const document = documents.find((each) => each.id === id);
      if (!document) throw new IntakeNotFoundError(id, ids);
      return document;
    },
    routeToQueue() {
      throw new Error("Replaced by the in-memory queues.");
    },
  };
  return withMemoryQueues(desk);
}
