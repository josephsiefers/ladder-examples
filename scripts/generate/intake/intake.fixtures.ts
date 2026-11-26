import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFirmDocuments, type IntakeDocument } from "../../../src/core/documents";
import type { IntakeLibrary } from "./library";
import type { IntakePlantSpec } from "./spec";

/** A small intake library: one MSA kind whose every variant says which one it is. */
export const LIBRARY: IntakeLibrary = {
  kinds: {
    msa: {
      docType: "msa",
      titles: ["Master Services Agreement", "Framework Services Agreement"],
      openingHeading: "Parties and Background",
      openings: [
        ["Opening A names {{first}} and {{second}}.", "Opening A sets the master terms."],
        ["Opening B names {{secondShort}} and {{firstShort}}.", "Opening B sets the terms."],
      ],
      sections: [
        { heading: "Services", variants: [["Services A."], ["Services B.", "Services B, more."]] },
        { heading: "Fees", variants: [["Fees A."], ["Fees B."]] },
        { heading: "Term", variants: [["Term A."], ["Term B."]] },
      ],
    },
  },
};

/** A clean MSA built from the library above. */
export const MSA_SPEC: IntakePlantSpec = {
  id: "intake-x1",
  split: "dev",
  seed: 3,
  docType: "msa",
  ambiguity: "clean",
  base: {
    source: "library",
    kind: "msa",
    parties: [
      { name: "Corvane Systems Limited", short: "Corvane" },
      { name: "Fennick Logistics plc", short: "Fennick" },
    ],
  },
  ingredients: [],
};

/** A clean NDA copied from the contract below. */
export const NDA_SPEC: IntakePlantSpec = {
  id: "intake-x2",
  split: "test",
  seed: 5,
  docType: "nda",
  ambiguity: "clean",
  base: { source: "nda-copy", contractId: "nda-src" },
  ingredients: [],
};

/** A UC1-style NDA: section 1 states the parties and who discloses, 2.1 defines the information. */
export const NDA_SOURCE = [
  "# Mutual Non-Disclosure Agreement",
  "",
  "## 1. Parties and Background",
  "",
  "1.1 This Agreement is made between Alder Ltd and Birch Ltd.",
  "",
  "1.2 Each party will disclose Confidential Information to the other.",
  "",
  "## 2. Definition of Confidential Information",
  "",
  '2.1 "Confidential Information" means all information disclosed for the Purpose.',
  "",
  "## 3. Signatures",
  "",
  "3.1 Signed by both parties.",
  "",
].join("\n");

export const CONTRACTS: ReadonlyMap<string, string> = new Map([["nda-src", NDA_SOURCE]]);

/** Reads a generated intake document back through the firm's intake desk, as UC2 reads it. */
export async function readAsIntake(documentId: string, markdown: string): Promise<IntakeDocument> {
  const root = await mkdtemp(join(tmpdir(), "intake-"));
  try {
    await mkdir(join(root, "intake"));
    await writeFile(join(root, "intake", `${documentId}.md`), markdown);
    return await createFirmDocuments({ root }).readIntake(documentId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
