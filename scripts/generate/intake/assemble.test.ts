import { describe, expect, it } from "vitest";
import { assembleIntake } from "./assemble";
import {
  CONTRACTS,
  LIBRARY,
  MSA_SPEC,
  NDA_SOURCE,
  NDA_SPEC,
  readAsIntake,
} from "./intake.fixtures";
import type { IntakePlantSpec } from "./spec";

const assemble = (spec: IntakePlantSpec) => assembleIntake(spec, LIBRARY, CONTRACTS);

describe("assembleIntake from a library kind", () => {
  it("writes a title, the opening as section 1, then every section in library order", async () => {
    const { markdown } = assemble(MSA_SPEC);
    const document = await readAsIntake(MSA_SPEC.id, markdown);

    expect(["Master Services Agreement", "Framework Services Agreement"]).toContain(document.title);
    expect(markdown).toContain("## 1. Parties and Background");
    expect(document.paragraphs.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["1.1", "1.2", "2.1", "3.1", "4.1"]),
    );
    const headings = [...markdown.matchAll(/^## \d+\. (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual(["Parties and Background", "Services", "Fees", "Term"]);
    expect(document.paragraphs.find(({ id }) => id === "1.1")?.text).toMatch(
      /^Opening [AB] names (Corvane|Fennick)/,
    );
    expect(markdown).not.toMatch(/[{}]/);
  });

  it("gives gold the type, ambiguity, and the title plus the opening as evidence", () => {
    expect(assemble(MSA_SPEC)).toMatchObject({
      documentId: "intake-x1",
      split: "dev",
      goldCase: {
        input: { documentId: "intake-x1" },
        gold: { docType: "msa", ambiguity: "clean" },
        evidence: { docType: ["title", "1.1", "1.2"] },
      },
    });
  });

  it("builds the same document from the same seed, and varies it across seeds", () => {
    expect(assemble(MSA_SPEC).markdown).toBe(assemble(MSA_SPEC).markdown);
    const documents = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => assemble({ ...MSA_SPEC, seed }).markdown),
    );
    expect(documents.size).toBeGreaterThan(1);
  });
});

describe("assembleIntake from a copied NDA", () => {
  it("copies the contract byte for byte", () => {
    expect(assemble(NDA_SPEC).markdown).toBe(NDA_SOURCE);
  });

  it("cites the title, the last paragraph of section 1, and the definition at 2.1", () => {
    expect(assemble(NDA_SPEC).goldCase).toEqual({
      input: { documentId: "intake-x2" },
      gold: { docType: "nda", ambiguity: "clean" },
      evidence: { docType: ["title", "1.2", "2.1"] },
    });
  });
});

describe("assembleIntake refuses", () => {
  it("a spec whose document type is not its base document's type", () => {
    expect(() => assemble({ ...MSA_SPEC, docType: "sow" })).toThrow(
      "intake-x1: its document type is sow, but its base document is a msa.",
    );
    expect(() => assemble({ ...NDA_SPEC, docType: "other" })).toThrow(
      "intake-x2: its document type is other, but its base document is a nda.",
    );
  });

  it("a library kind or contract that does not exist", () => {
    expect(() =>
      assemble({
        ...MSA_SPEC,
        base: { ...MSA_SPEC.base, kind: "charterparty" },
      } as IntakePlantSpec),
    ).toThrow("intake-x1: no kind charterparty in the intake library.");
    expect(() =>
      assemble({ ...NDA_SPEC, base: { source: "nda-copy", contractId: "nda-x" } }),
    ).toThrow("intake-x2: no contract nda-x to copy.");
  });

  it("a contract with no section 2, where UC1 defines confidential information", () => {
    const opening = NDA_SOURCE.slice(0, NDA_SOURCE.indexOf("## 2."));
    const contracts = new Map([["nda-src", opening]]);
    expect(() => assembleIntake(NDA_SPEC, LIBRARY, contracts)).toThrow(
      "intake-x2: contract nda-src has no section 2 to cite.",
    );
  });

  it("a library variant with an unknown placeholder, naming its kind", () => {
    const msa = LIBRARY.kinds.msa;
    if (msa === undefined) throw new Error("the fixture library has an MSA");
    const sections = msa.sections.map((section) => ({
      ...section,
      variants: section.variants.map(() => ["Payable by {{payer}}."]),
    }));
    const library = { kinds: { msa: { ...msa, sections } } };
    expect(() => assembleIntake(MSA_SPEC, library, CONTRACTS)).toThrow(
      "Template 'intake/msa': unknown placeholder {{payer}}.",
    );
  });

  it("ingredients, which the intake library has none of yet", () => {
    expect(() =>
      assemble({ ...MSA_SPEC, ambiguity: "hybrid", ingredients: ["dpa-schedule"] }),
    ).toThrow("intake-x1: no ingredient dpa-schedule in the intake library.");
  });
});
