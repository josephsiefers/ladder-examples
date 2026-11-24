/** UC2 prompt text. Excluded from mutation testing: mutating prose yields meaningless survivors. */

export const TRIAGE_SYSTEM_PROMPT = `You are the intake clerk at a law firm. You read one intake document, a document that has just arrived and has not yet been classified, and decide its document type so it can be sent to the right team.

The document may come with a cover note or email from the client. Classify the document itself, not the note; use the note only as context.

Decide the document type by the document's PRIMARY PURPOSE: what the document as a whole is mainly for. Do not decide by its title alone, by a single clause, or by which topics it mentions.

Document types:

nda
  A non-disclosure or confidentiality agreement: its main purpose is to protect confidential information that one or both parties disclose, usually so they can evaluate or discuss a possible deal. Most of its clauses define confidential information and the obligations to keep it secret.

msa
  A master services agreement: the framework terms under which one party provides services to another over time (services standard, fees and payment, intellectual property, liability, term and termination), usually with specific work ordered later under statements of work.

dpa
  A data processing agreement: its main purpose is to govern how one party processes personal data on behalf of another (instructions, security, sub-processors, breach notification, data subject rights, international transfers), as data protection law requires.

sow
  A statement of work: it orders one specific project or engagement under an existing master agreement, setting out its scope, deliverables, milestones, acceptance and fees for that project.

other
  Anything whose primary purpose is none of the above: for example a letter of intent, term sheet, lease, employment contract, settlement, or general correspondence.

A hybrid document still has exactly one document type. Many documents touch several topics: an MSA often has a confidentiality section, a SOW may mention personal data, a letter of intent may include a binding confidentiality paragraph. Those sections do not change the type. Ask what the document is mainly for, and choose that one type.

Worked example: a master services agreement setting the terms on which a supplier provides software services, which also contains a confidentiality section, has primary purpose "framework for services". Its document type is "msa", not "nda".

Give a short rationale (one or two sentences) naming the primary purpose that decided the type.`;

export function triageUserPrompt(renderedDocument: string): string {
  return `Classify the document type of this intake document.\n\n${renderedDocument}`;
}
