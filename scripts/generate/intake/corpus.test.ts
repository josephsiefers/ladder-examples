import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DOC_TYPES, TITLE_EVIDENCE } from "../../../src/core/documents";
import { coverage, shortfall } from "../coverage";
import { assembleIntake } from "./assemble";
import { INTAKE_CORPUS, INTAKE_COVERAGE, loadCopiedContracts } from "./corpus";
import { readAsIntake } from "./intake.fixtures";
import { loadIntakeLibrary } from "./library";
import type { IntakePlantSpec } from "./spec";

const { specs, filesOf } = await INTAKE_CORPUS.load({});
const library = await loadIntakeLibrary();
const contracts = await loadCopiedContracts(specs);
const built = await Promise.all(
  specs.map(async (spec) => {
    const intake = assembleIntake(spec, library, contracts);
    return { spec, intake, document: await readAsIntake(intake.documentId, intake.markdown) };
  }),
);

/** Words in a document's paragraphs, headings and title excluded, as an associate reads it. */
const words = (paragraphs: readonly { id?: string; text: string }[]) =>
  paragraphs.filter(({ text }) => !text.startsWith("#")).flatMap(({ text }) => text.split(/\s+/))
    .length;

describe("the committed intake corpus", () => {
  it("builds every document in both splits", () => {
    expect(new Set(specs.map(({ split }) => split))).toEqual(new Set(["dev", "test"]));
    expect(specs.flatMap(filesOf)).toHaveLength(specs.length * 2);
    expect(coverage(specs, INTAKE_COVERAGE).every(({ met }) => met)).toBe(true);
  });

  it("builds at least one document from every library kind", () => {
    const used = new Set(
      specs.flatMap(({ base }) => (base.source === "library" ? [base.kind] : [])),
    );
    expect([...used].toSorted()).toEqual(Object.keys(library.kinds).toSorted());
  });

  it("copies each clean NDA byte for byte from UC1's corpus", async () => {
    const copies = built.flatMap(({ spec: { base, ambiguity }, intake }) =>
      base.source === "nda-copy" && ambiguity === "clean"
        ? [{ contractId: base.contractId, intake }]
        : [],
    );
    expect(copies.length).toBeGreaterThan(0);
    for (const { contractId, intake } of copies) {
      const source = new URL(`../../../data/firm/contracts/${contractId}.md`, import.meta.url);
      expect(intake.markdown).toBe(await readFile(source, "utf8"));
    }
  });

  it("modifies each hybrid NDA copy only by sections added before its signatures", async () => {
    const copies = built.flatMap(({ spec: { base, ambiguity }, intake }) =>
      base.source === "nda-copy" && ambiguity === "hybrid"
        ? [{ contractId: base.contractId, intake }]
        : [],
    );
    expect(copies.length).toBeGreaterThan(0);
    for (const { contractId, intake } of copies) {
      const source = await readFile(
        new URL(`../../../data/firm/contracts/${contractId}.md`, import.meta.url),
        "utf8",
      );
      const signatures = source.lastIndexOf("\n## ") + 1;
      expect(intake.markdown).not.toBe(source);
      expect(intake.markdown.startsWith(source.slice(0, signatures))).toBe(true);
      expect(intake.markdown).toMatch(/\n## \d+\. Signatures\n/);
    }
  });

  it("has 30 documents, 18 dev and 12 test, of roughly the spec's mix of types", () => {
    const count = (split: string) => specs.filter((spec) => spec.split === split).length;
    expect([specs.length, count("dev"), count("test")]).toEqual([30, 18, 12]);
    const types = Object.fromEntries(
      DOC_TYPES.map((type) => [type, specs.filter(({ docType }) => docType === type).length]),
    );
    expect(types).toEqual({ nda: 10, msa: 5, dpa: 4, sow: 4, other: 7 });
  });

  it("has at least 6 hybrids, in both splits, on at least 3 base document types", () => {
    const hybrids = specs.filter(({ ambiguity }) => ambiguity === "hybrid");
    expect(hybrids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(hybrids.map(({ split }) => split))).toEqual(new Set(["dev", "test"]));
    const bases = new Set(
      hybrids.map(({ base }) => (base.source === "library" ? base.kind : "nda-copy")),
    );
    const baseTypes = new Set(hybrids.map(({ docType }) => docType));
    expect(bases.size).toBeGreaterThanOrEqual(3);
    expect(baseTypes.size).toBeGreaterThanOrEqual(3);
  });

  it("gives every hybrid an ingredient of a type other than its gold type", () => {
    for (const { id, docType, ambiguity, ingredients } of specs) {
      if (ambiguity !== "hybrid") continue;
      const types = ingredients.map((name) => library.ingredients[name]?.docType);
      expect({ id, other: types.some((type) => type !== undefined && type !== docType) }).toEqual({
        id,
        other: true,
      });
    }
  });

  it("gives every document the gold type of its base document", () => {
    for (const { spec, intake } of built) {
      const { base } = spec;
      const baseType = base.source === "library" ? library.kinds[base.kind]?.docType : "nda";
      expect({ id: spec.id, gold: intake.goldCase.gold.docType }).toEqual({
        id: spec.id,
        gold: baseType,
      });
    }
  });

  it("gives no clean document an ingredient, and labels it clean", () => {
    for (const { spec, intake } of built.filter((entry) => entry.spec.ambiguity === "clean")) {
      expect({ id: spec.id, ingredients: spec.ingredients }).toEqual({
        id: spec.id,
        ingredients: [],
      });
      expect(intake.goldCase.gold.ambiguity).toBe("clean");
    }
  });

  it("cites the title only where the title names the document's type", () => {
    // The title establishes primary purpose only when it names the type, e.g. "Statement of Work".
    const names: Record<Exclude<(typeof DOC_TYPES)[number], "other">, RegExp> = {
      nda: /confidential|non-disclosure/i,
      msa: /master|framework/i,
      dpa: /data (processing|protection)/i,
      sow: /statement of work/i,
    };
    for (const { intake, document } of built) {
      const { docType } = intake.goldCase.gold;
      if (!intake.goldCase.evidence.docType.includes(TITLE_EVIDENCE)) continue;
      const named = Object.entries(names).filter(([, name]) => name.test(document.title));
      const expected = docType === "other" ? [] : [docType];
      expect({ title: document.title, named: named.map(([type]) => type) }).toEqual({
        title: document.title,
        named: expected,
      });
    }
  });

  it("cites, as evidence, the title and only paragraph IDs its document has", () => {
    for (const { intake, document } of built) {
      const [title, ...ids] = intake.goldCase.evidence.docType;
      const known = document.paragraphs.flatMap(({ id }) => (id === undefined ? [] : [id]));
      expect(title).toBe(TITLE_EVIDENCE);
      expect(ids.length).toBeGreaterThan(0);
      expect(known).toEqual(expect.arrayContaining(ids));
    }
  });

  it("assembles each library document to 1–2 pages", () => {
    for (const { spec, document } of built.filter(
      (entry) => entry.spec.base.source === "library",
    )) {
      const count = words(document.paragraphs);
      expect({ id: spec.id, inRange: count >= 400 && count <= 900 }).toEqual({
        id: spec.id,
        inRange: true,
      });
    }
  });

  it("leaves out a contract to copy that UC1's corpus does not have", async () => {
    const missing = { ...specs[0], base: { source: "nda-copy", contractId: "nda-missing" } };
    expect(await loadCopiedContracts([missing as IntakePlantSpec])).toEqual(new Map());
  });

  it("gives no document an ID that names a document type", () => {
    for (const { id } of specs) {
      for (const type of DOC_TYPES) expect(id).not.toContain(type);
    }
  });
});

/** Every error the coverage gate gives the corpus: its shortfall, then its own checks. */
const gate = (changed: readonly IntakePlantSpec[]) => [
  shortfall(coverage(changed, INTAKE_COVERAGE), INTAKE_COVERAGE.minimums),
  ...(INTAKE_CORPUS.gate?.(changed) ?? []),
];
/** The spec made clean. */
const clean = (spec: IntakePlantSpec): IntakePlantSpec => ({
  ...spec,
  ambiguity: "clean",
  ingredients: [],
});

describe("the intake corpus's coverage gate", () => {
  it("passes the committed corpus", () => {
    expect(gate(specs)).toEqual([undefined]);
  });

  it("refuses a corpus of the wrong total size", () => {
    expect(gate(specs.slice(1))).toContain(
      "error: the intake corpus has 29 documents (17 dev, 12 test); it needs 30 (18 dev, 12 test). Add, remove or move plant specs.",
    );
  });

  it("refuses a corpus of the right size whose splits are the wrong sizes", () => {
    const moved = specs.map((spec, at) =>
      at === specs.findIndex(({ split }) => split === "dev")
        ? { ...spec, split: "test" as const }
        : spec,
    );
    expect(gate(moved)).toContain(
      "error: the intake corpus has 30 documents (17 dev, 13 test); it needs 30 (18 dev, 12 test). Add, remove or move plant specs.",
    );
  });

  it("refuses fewer than 6 hybrids", () => {
    const hybrids = specs.filter(({ ambiguity }) => ambiguity === "hybrid");
    const fewer = specs.map((spec) => (hybrids.slice(5).includes(spec) ? clean(spec) : spec));
    expect(gate(fewer)).toEqual([
      undefined,
      "error: the intake corpus has 5 hybrid documents; it needs at least 6. Add ingredients to a clean plant spec.",
    ]);
  });

  it("refuses a split with no hybrids", () => {
    const noTestHybrids = specs.map((spec) => (spec.split === "test" ? clean(spec) : spec));
    expect(gate(noTestHybrids)[0]).toBe(
      "error: coverage minimums not met (1 in dev, 1 in test) for 1 plant(s): hybrid in test; add or change plant specs.",
    );
  });

  it("refuses a split missing a document type", () => {
    const noTestSow = specs.map((spec) =>
      spec.split === "test" && spec.docType === "sow" ? { ...spec, split: "dev" as const } : spec,
    );
    expect(gate(noTestSow)[0]).toBe(
      "error: coverage minimums not met (1 in dev, 1 in test) for 1 plant(s): sow in test; add or change plant specs.",
    );
  });
});
