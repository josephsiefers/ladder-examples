import { describe, expect, it } from "vitest";
import { MalformedContractError, parseContract } from "./contract";

const WELL_FORMED = `# Mutual Non-Disclosure Agreement

## 1. Parties and Background

1.1 This Agreement is made between Alpha Limited and Beta Limited.   
  
1.2 The parties wish to discuss a possible collaboration
and will exchange information for that purpose.

## 2. Term

2.1 This Agreement continues for twenty-four (24) months.
`;

describe("parseContract", () => {
  it("reads the title, numbered sections and paragraph IDs", () => {
    const contract = parseContract("nda-x", WELL_FORMED);

    expect(contract).toEqual({
      id: "nda-x",
      title: "Mutual Non-Disclosure Agreement",
      sections: [
        {
          number: 1,
          heading: "Parties and Background",
          paragraphs: [
            {
              id: "1.1",
              text: "This Agreement is made between Alpha Limited and Beta Limited.",
            },
            {
              id: "1.2",
              text: "The parties wish to discuss a possible collaboration and will exchange information for that purpose.",
            },
          ],
        },
        {
          number: 2,
          heading: "Term",
          paragraphs: [
            { id: "2.1", text: "This Agreement continues for twenty-four (24) months." },
          ],
        },
      ],
    });
  });

  it("numbers paragraphs past 9", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `1.${i + 1} Paragraph ${i + 1}.`);
    const markdown = ["# A", "## 1. Parties and Background", ...paragraphs].join("\n\n");

    const ids = parseContract("nda-x", markdown).sections[0]?.paragraphs.map(({ id }) => id);

    expect(ids?.at(-1)).toBe("1.10");
  });

  it.each([
    {
      problem: "no title on the first line",
      markdown: "## 1. Parties and Background\n\n1.1 Text.",
      line: 1,
      reason: "expected a '# Title' line",
    },
    {
      problem: "a second title",
      markdown: "# A\n\n# B\n\n## 1. Parties and Background\n\n1.1 Text.",
      line: 3,
      reason: "unexpected second title",
    },
    {
      problem: "a paragraph before any section",
      markdown: "# A\n\n1.1 Text.",
      line: 3,
      reason: "paragraph before the first section heading",
    },
    {
      problem: "a paragraph without its number",
      markdown: "# A\n\n## 1. Parties and Background\n\n1.1 Text.\n\nUnnumbered text.",
      line: 7,
      reason: "paragraph must start with its number, expected '1.2'",
    },
    {
      problem: "a paragraph numbered for another section",
      markdown: "# A\n\n## 1. Parties and Background\n\n2.1 Text.",
      line: 5,
      reason: "paragraph must start with its number, expected '1.1'",
    },
    {
      problem: "a skipped paragraph number",
      markdown: "# A\n\n## 1. Parties and Background\n\n1.1 Text.\n\n1.3 Text.",
      line: 7,
      reason: "paragraph must start with its number, expected '1.2'",
    },
    {
      problem: "a skipped section number",
      markdown: "# A\n\n## 1. Parties and Background\n\n1.1 Text.\n\n## 3. Term\n\n3.1 Text.",
      line: 7,
      reason: "expected section 2",
    },
    {
      problem: "a first section other than Parties and Background",
      markdown: "# A\n\n## 1. Definitions\n\n1.1 Text.",
      line: 3,
      reason: "section 1 must be 'Parties and Background'",
    },
    {
      problem: "a section with no paragraphs",
      markdown: "# A\n\n## 1. Parties and Background\n\n## 2. Term\n\n2.1 Text.",
      line: 3,
      reason: "section 1 has no paragraphs",
    },
    {
      problem: "a final section with no paragraphs",
      markdown:
        "# A\n\n## 1. Parties and Background\n\n1.1 Text.\n\n## 2. Term\n\n2.1 Text.\n\n## 3. Law\n",
      line: 11,
      reason: "section 3 has no paragraphs",
    },
    {
      problem: "a paragraph whose number is not at its start",
      markdown: "# A\n\n## 1. Parties and Background\n\nSee 1.1 above.",
      line: 5,
      reason: "paragraph must start with its number, expected '1.1'",
    },
    {
      problem: "a sub-heading in place of a paragraph",
      markdown: "# A\n\n## 1. Parties and Background\n\n### 1. Recitals",
      line: 5,
      reason: "paragraph must start with its number, expected '1.1'",
    },
    {
      problem: "an empty file",
      markdown: "",
      line: 1,
      reason: "expected a '# Title' line",
    },
    {
      problem: "no sections at all",
      markdown: "# A\n",
      line: 1,
      reason: "contract has no sections",
    },
  ])("rejects $problem, naming the offending line", ({ markdown, line, reason }) => {
    const parse = () => parseContract("nda-x", markdown);

    expect(parse).toThrow(MalformedContractError);
    expect(parse).toThrow(expect.objectContaining({ name: "MalformedContractError", line }));
    expect(parse).toThrow(`Contract 'nda-x' is malformed at line ${line}: ${reason}.`);
  });
});
