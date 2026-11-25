import { describe, expect, it } from "vitest";
import { assembleIntake } from "./assemble";
import { CLEAN_MSA, PARTIES, SOURCE_NDA, TEST_LIBRARY } from "./intake.fixtures";
import type { IntakePlantSpec } from "./spec";

const contracts = new Map([["nda-gen-01", SOURCE_NDA]]);
const assemble = (spec: IntakePlantSpec) => assembleIntake(spec, TEST_LIBRARY, contracts);

const headings = (markdown: string) => markdown.split("\n").filter((line) => line.startsWith("#"));

const hybrid = (changes: Partial<IntakePlantSpec>): IntakePlantSpec => ({
  ...CLEAN_MSA,
  ambiguity: "hybrid",
  ...changes,
});

const ndaCopy = (ingredients: string[]): IntakePlantSpec => ({
  id: "intake-gen-02",
  split: "test",
  seed: 9,
  docType: "nda",
  ambiguity: ingredients.length > 0 ? "hybrid" : "clean",
  base: { kind: "nda-copy", contractId: "nda-gen-01" },
  ingredients,
});

describe("assembleIntake: a library document", () => {
  it("opens with the parties and purpose, then numbers every section in the firm's format", () => {
    const { markdown, goldCase, documentId, split } = assemble(CLEAN_MSA);
    expect(documentId).toBe("intake-gen-01");
    expect(split).toBe("dev");
    const lines = markdown.split("\n");
    expect(lines[0]).toMatch(/^# Services Agreement (One|Two)$/);
    expect(lines[2]).toBe("## 1. Parties and Background");
    expect(markdown).toMatch(
      /\n1\.1 (Corvane Systems Limited and Fennick|Fennick Logistics plc engages)/,
    );
    expect(
      headings(markdown)
        .slice(2)
        .map((h) => h.replace(/^## \d\. /, ""))
        .toSorted(),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(headings(markdown).map((h) => h.match(/^## (\d)\./)?.[1])).toEqual([
      undefined,
      "1",
      "2",
      "3",
      "4",
    ]);
    expect(markdown.endsWith(".\n")).toBe(true);
    expect(goldCase).toEqual({
      input: { documentId: "intake-gen-01" },
      gold: { docType: "msa", ambiguity: "clean" },
      evidence: { docType: ["title", "1.1", "1.2"] },
    });
  });

  it("gives the same bytes for the same spec, and varies with the seed", () => {
    expect(assemble(CLEAN_MSA)).toEqual(assemble(CLEAN_MSA));
    const markdowns = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => assemble({ ...CLEAN_MSA, seed }).markdown),
    );
    expect(markdowns.size).toBeGreaterThan(3);
  });

  it("puts a body section after the opening and a schedule last, keeping the evidence", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const body = assemble(hybrid({ seed, ingredients: ["confidentiality"] }));
      const found = headings(body.markdown).findIndex((h) => h.endsWith(". Confidentiality"));
      expect(found).toBeGreaterThan(1);
      expect(body.markdown).toMatch(/\n\d\.1 Keep Fennick's secrets\.\n\n\d\.2 Survives/);
      expect(body.goldCase.gold).toEqual({ docType: "msa", ambiguity: "hybrid" });
      expect(body.goldCase.evidence.docType).toEqual(["title", "1.1", "1.2"]);
    }
    const schedule = assemble(hybrid({ ingredients: ["schedule"] }));
    expect(headings(schedule.markdown).at(-1)).toBe("## 5. Schedule 1: Data Processing");
    expect(schedule.markdown).toContain("\n5.1 Corvane processes personal data for Fennick.\n");
  });

  it("replaces the title with a title ingredient", () => {
    const { markdown } = assemble(hybrid({ ingredients: ["sharing-title"] }));
    expect(markdown.startsWith("# Data Sharing Agreement\n")).toBe(true);
  });

  it("writes a letter kind as list-numbered paragraphs between a salutation and a sign-off", () => {
    const { markdown, goldCase } = assemble({
      ...CLEAN_MSA,
      docType: "other",
      base: { kind: "library", name: "lease", parties: PARTIES },
    });
    const lines = markdown.split("\n").filter((line) => line !== "");
    expect(lines[0]).toMatch(/^# Lease (One|Two)$/);
    expect(lines[1]).toBe("Dear Fennick,");
    expect(lines.slice(2, -1).map((line) => line.match(/^(\d+)\. /)?.[1])).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      ...(lines.length === 8 ? [] : ["6"]),
    ]);
    expect(lines.at(-1)).toBe("Yours, Corvane Systems Limited");
    expect(goldCase.evidence.docType).toEqual(["title", "1", "2"]);
  });

  it("recasts the base document as a letter with a letter ingredient", () => {
    const { markdown, goldCase } = assemble(
      hybrid({
        docType: "nda",
        base: { kind: "library", name: "short-nda", parties: PARTIES },
        ingredients: ["letter-form"],
      }),
    );
    const lines = markdown.split("\n").filter((line) => line !== "");
    expect(lines.slice(0, 2)).toEqual(["# Re: Confidentiality", "Dear Fennick,"]);
    expect(lines[2]).toMatch(/^1\. /);
    expect(lines.at(-1)).toBe("Kind regards, Corvane Systems Limited");
    expect(goldCase.evidence.docType).toEqual(["title", "1", "2"]);
  });
});

describe("assembleIntake: a copied NDA", () => {
  it("copies the source byte for byte, citing the title, the purpose and the definition", () => {
    const { markdown, goldCase } = assemble(ndaCopy([]));
    expect(markdown).toBe(SOURCE_NDA);
    expect(goldCase).toEqual({
      input: { documentId: "intake-gen-02" },
      gold: { docType: "nda", ambiguity: "clean" },
      evidence: { docType: ["title", "1.2", "2.1"] },
    });
  });

  it("adds a section before the signatures and renumbers them", () => {
    const { markdown } = assemble(ndaCopy(["non-solicitation"]));
    expect(markdown).toContain(
      "## 3. Non-Solicitation of Employees\n\n3.1 No hiring for twelve months.\n\n## 4. Signatures\n\n4.1 Signed for A.\n\n4.2 Signed for B.\n",
    );
    expect(markdown.startsWith(SOURCE_NDA.slice(0, SOURCE_NDA.indexOf("## 3.")))).toBe(true);
  });

  it("fails when the source contract is not known", () => {
    expect(() =>
      assemble({ ...ndaCopy([]), base: { kind: "nda-copy", contractId: "nda-gen-99" } }),
    ).toThrow("intake-gen-02: no contract nda-gen-99 to copy.");
  });
});

describe("assembleIntake: gold consistency", () => {
  it("refuses a document type that is not the base document's type", () => {
    expect(() => assemble({ ...CLEAN_MSA, docType: "sow" })).toThrow(
      "intake-gen-01: its document type is sow, but its base document is a msa.",
    );
    expect(() => assemble({ ...ndaCopy([]), docType: "msa" })).toThrow(
      "intake-gen-02: its document type is msa, but its base document is a nda.",
    );
  });

  it("refuses an ingredient of the document's own type, or one it does not know", () => {
    expect(() =>
      assemble(
        hybrid({
          docType: "nda",
          base: { kind: "library", name: "short-nda", parties: PARTIES },
          ingredients: ["confidentiality"],
        }),
      ),
    ).toThrow(
      "intake-gen-01: ingredient confidentiality is itself a nda, so it adds no other type.",
    );
    expect(() => assemble(hybrid({ ingredients: ["nope"] }))).toThrow(
      "intake-gen-01: no ingredient nope in the intake library.",
    );
    expect(() =>
      assemble({ ...CLEAN_MSA, base: { kind: "library", name: "nope", parties: PARTIES } }),
    ).toThrow("intake-gen-01: no kind nope in the intake library.");
  });

  it("refuses to recast a copied NDA, which has no paragraphs of its own to renumber", () => {
    expect(() => assemble(ndaCopy(["letter-form"]))).toThrow(
      "intake-gen-02: a copied NDA takes only section ingredients, not letter-form.",
    );
  });
});
