/** The firm's team queues an intake document can be routed to. */
export const QUEUES = ["nda-review", "commercial", "privacy", "senior-associate"] as const;

export type Queue = (typeof QUEUES)[number];

/** One paragraph of an intake document. Numbered documents keep each paragraph's ID, e.g. `4.2` or `6`. */
export interface IntakeParagraph {
  id?: string;
  text: string;
}

/** A document arriving at the firm, not yet classified or routed: a title plus free-form text. */
export interface IntakeDocument {
  id: string;
  title: string;
  paragraphs: IntakeParagraph[];
}

/** What routing one intake document records in its queue. */
export interface RoutingRecord {
  id: string;
  queue: Queue;
  rationale: string;
  /** ISO 8601. */
  routedAt: string;
}

/** The firm's receipt for a routed document: the record, and its 1-based place in the queue. */
export interface RoutingReceipt extends RoutingRecord {
  position: number;
}

/** Intent-level access to the firm's intake: list, read, and route to a queue. */
export interface IntakeDesk {
  listIntake(): Promise<string[]>;
  readIntake(id: string): Promise<IntakeDocument>;
  routeToQueue(request: {
    documentId: string;
    queue: Queue;
    rationale: string;
  }): Promise<RoutingReceipt>;
}

/** No intake document with this ID exists in the firm. */
export class IntakeNotFoundError extends Error {
  override name = "IntakeNotFoundError";

  constructor(
    readonly documentId: string,
    knownIds: readonly string[],
  ) {
    const known = knownIds.length > 0 ? knownIds.join(", ") : "(none)";
    super(`Intake document '${documentId}' not found. Known intake documents: ${known}.`);
  }
}

/** The intake file has no `# Title` first line. */
export class MalformedIntakeError extends Error {
  override name = "MalformedIntakeError";

  constructor(readonly documentId: string) {
    super(`Intake document '${documentId}' is malformed: expected a '# Title' first line.`);
  }
}

const TITLE = /^# (\S.*)/;
/** A paragraph ID (see GLOSSARY.md): a clause number such as `4.2`, or a list number such as `6.`. */
const PARAGRAPH_ID = /^(?:(\d+\.\d+)|(\d+)\.) (\S.*)/;

/**
 * Parses an intake document: a `# Title` first line, then blank-line-separated paragraphs. A
 * paragraph starting with a paragraph ID keeps it: `4.2` as `4.2`, and `6.` as `6`.
 */
export function parseIntake(id: string, markdown: string): IntakeDocument {
  const [first = "", ...rest] = markdown.trim().split(/\r?\n/);
  const title = TITLE.exec(first.trim())?.[1];
  if (title === undefined) throw new MalformedIntakeError(id);
  const paragraphs = rest
    .join("\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .join(" ")
        .trim(),
    )
    .filter((text) => text !== "")
    .map((text): IntakeParagraph => {
      const match = PARAGRAPH_ID.exec(text);
      if (match === null) return { text };
      const [, clause, item, body = ""] = match;
      return { id: clause ?? item ?? "", text: body };
    });
  return { id, title, paragraphs };
}

/** Renders an intake document for a prompt, numbered paragraphs marked `[4.2]` or `[6]`. */
export function renderIntakeForPrompt(document: IntakeDocument): string {
  const paragraphs = document.paragraphs.map(({ id, text }) =>
    id === undefined ? text : `[${id}] ${text}`,
  );
  return [
    `<intake-document id="${document.id}">`,
    `# ${document.title}`,
    "",
    paragraphs.join("\n\n"),
    "</intake-document>",
  ].join("\n");
}
