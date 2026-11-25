import {
  type IntakeDesk,
  type IntakeDocument,
  IntakeNotFoundError,
  type Queue,
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

/** An in-memory intake desk holding two documents; routing requests are kept in `routed`. */
export function createFakeIntakeDesk(): IntakeDesk & {
  routed: { documentId: string; queue: Queue; rationale: string }[];
} {
  const documents = [LETTER, MSA_WITH_CONFIDENTIALITY];
  const ids = documents.map((document) => document.id);
  const routed: { documentId: string; queue: Queue; rationale: string }[] = [];
  const find = (id: string) => {
    const document = documents.find((each) => each.id === id);
    if (!document) throw new IntakeNotFoundError(id, ids);
    return document;
  };
  return {
    routed,
    async listIntake() {
      return ids;
    },
    async readIntake(id) {
      return find(id);
    },
    async routeToQueue(request) {
      find(request.documentId);
      routed.push(request);
      const position = routed.filter((each) => each.queue === request.queue).length;
      const { documentId: id, queue, rationale } = request;
      return { id, queue, rationale, routedAt: "2026-11-24T09:30:00.000Z", position };
    },
  };
}
