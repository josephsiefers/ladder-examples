import { CLAUSE_NUMBER } from "./paragraph-id";

/** One numbered paragraph, e.g. `4.2`. Its ID is how evidence and redlines cite it. */
export interface Paragraph {
  id: string;
  text: string;
}

export interface Section {
  number: number;
  heading: string;
  paragraphs: Paragraph[];
}

/** A contract held by the firm, as the translation layer exposes it. */
export interface Contract {
  id: string;
  title: string;
  sections: Section[];
}

/** The contract file breaks the firm's format; `line` is the 1-based line at fault. */
export class MalformedContractError extends Error {
  override name = "MalformedContractError";

  constructor(
    readonly contractId: string,
    readonly line: number,
    reason: string,
  ) {
    super(`Contract '${contractId}' is malformed at line ${line}: ${reason}.`);
  }
}

/** Section 1 of every firm contract carries this heading. */
const FIRST_SECTION_HEADING = "Parties and Background";

const TITLE = /^# \S/;
const SECTION_HEADING = /^## (\d+)\. (\S.*)/;
const PARAGRAPH_NUMBER = new RegExp(String.raw`^(${CLAUSE_NUMBER}) \S`);

/**
 * Parses the firm's contract Markdown: a `# Title`, then `## N. Heading` sections numbered from 1,
 * each holding blank-line-separated paragraphs that start with their number (`N.M`). Section 1 is
 * "Parties and Background".
 */
export function parseContract(id: string, markdown: string): Contract {
  const malformed = (line: number, reason: string) => new MalformedContractError(id, line, reason);
  let title: { text: string; line: number } | undefined;
  const sections: { section: Section; line: number }[] = [];
  let paragraph: Paragraph | undefined;

  const requireParagraphs = (current: { section: Section; line: number } | undefined) => {
    if (current && current.section.paragraphs.length === 0) {
      throw malformed(current.line, `section ${current.section.number} has no paragraphs`);
    }
  };

  for (const [index, raw] of markdown.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = raw.trim();
    if (line === "") {
      paragraph = undefined;
      continue;
    }

    const isTitle = TITLE.test(line);
    if (!title) {
      if (!isTitle) throw malformed(lineNumber, "expected a '# Title' line");
      title = { text: line.slice(2), line: lineNumber };
      continue;
    }
    if (isTitle) throw malformed(lineNumber, "unexpected second title");

    const headingMatch = SECTION_HEADING.exec(line);
    if (headingMatch) {
      requireParagraphs(sections.at(-1));
      const number = Number(headingMatch[1]);
      const heading = headingMatch[2] ?? "";
      if (number !== sections.length + 1) {
        throw malformed(lineNumber, `expected section ${sections.length + 1}`);
      }
      if (number === 1 && heading !== FIRST_SECTION_HEADING) {
        throw malformed(lineNumber, `section 1 must be '${FIRST_SECTION_HEADING}'`);
      }
      sections.push({ section: { number, heading, paragraphs: [] }, line: lineNumber });
      paragraph = undefined;
      continue;
    }

    if (paragraph) {
      paragraph.text += ` ${line}`;
      continue;
    }

    const current = sections.at(-1)?.section;
    if (!current) throw malformed(lineNumber, "paragraph before the first section heading");
    const expected = `${current.number}.${current.paragraphs.length + 1}`;
    if (PARAGRAPH_NUMBER.exec(line)?.[1] !== expected) {
      throw malformed(lineNumber, `paragraph must start with its number, expected '${expected}'`);
    }
    paragraph = { id: expected, text: line.slice(expected.length + 1) };
    current.paragraphs.push(paragraph);
  }

  if (!title) throw malformed(1, "expected a '# Title' line");
  if (sections.length === 0) throw malformed(title.line, "contract has no sections");
  requireParagraphs(sections.at(-1));

  return { id, title: title.text, sections: sections.map(({ section }) => section) };
}
