import type { IntakeLibrary, Kind } from "./library";
import type { IntakePlantSpec } from "./spec";

const kind = (docType: Kind["docType"], name: string): Kind => ({
  docType,
  titles: [`${name} One`, `${name} Two`],
  openings: [
    ["{{first}} and {{second}} make this {{name}}.", "{{firstShort}} serves {{secondShort}}."],
    ["{{second}} engages {{first}}.", "{{secondShort}} pays {{firstShort}}."],
  ].map((paragraphs) => paragraphs.map((text) => text.replace("{{name}}", name))),
  sections: [
    { heading: "Alpha", variants: [["Alpha one."], ["Alpha two."]] },
    { heading: "Beta", variants: [["Beta one.", "Beta more."], ["Beta two."]] },
    { heading: "Gamma", variants: [["Gamma one."], ["Gamma two."]] },
  ],
});

/** A small intake library: an MSA kind, a letter kind of type other, and one of each ingredient. */
export const TEST_LIBRARY: IntakeLibrary = {
  kinds: {
    msa: kind("msa", "Services Agreement"),
    "short-nda": kind("nda", "Confidentiality Agreement"),
    lease: {
      ...kind("other", "Lease"),
      letter: { salutation: "Dear {{secondShort}},", signoff: "Yours, {{first}}" },
    },
  },
  ingredients: {
    confidentiality: {
      docType: "nda",
      kind: "section",
      placement: "body",
      heading: "Confidentiality",
      paragraphs: ["Keep {{secondShort}}'s secrets.", "Survives five years."],
    },
    schedule: {
      docType: "dpa",
      kind: "section",
      placement: "end",
      heading: "Schedule 1: Data Processing",
      paragraphs: ["{{firstShort}} processes personal data for {{secondShort}}."],
    },
    "non-solicitation": {
      docType: "other",
      kind: "section",
      placement: "body",
      heading: "Non-Solicitation of Employees",
      paragraphs: ["No hiring for twelve months."],
    },
    "sharing-title": { docType: "other", kind: "title", titles: ["Data Sharing Agreement"] },
    "letter-form": {
      docType: "other",
      kind: "letter",
      titles: ["Re: Confidentiality"],
      salutation: "Dear {{secondShort}},",
      signoff: "Kind regards, {{first}}",
    },
  },
};

export const PARTIES: [{ name: string; short: string }, { name: string; short: string }] = [
  { name: "Corvane Systems Limited", short: "Corvane" },
  { name: "Fennick Logistics plc", short: "Fennick" },
];

export const CLEAN_MSA: IntakePlantSpec = {
  id: "intake-gen-01",
  split: "dev",
  seed: 5,
  docType: "msa",
  ambiguity: "clean",
  base: { kind: "library", name: "msa", parties: PARTIES },
  ingredients: [],
};

/** A short UC1-style NDA, in the firm's contract format. */
export const SOURCE_NDA = `# Mutual Non-Disclosure Agreement

## 1. Parties and Background

1.1 This Agreement is made between A and B.

1.2 A and B wish to exchange information.

## 2. Definition of Confidential Information

2.1 "Confidential Information" means secrets.

## 3. Signatures

3.1 Signed for A.

3.2 Signed for B.
`;
