import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DOC_TYPES, TITLE_EVIDENCE } from "../../../src/core/documents";
import { coverage } from "../coverage";
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

  it("copies each NDA byte for byte from UC1's corpus", async () => {
    const copies = built.flatMap(({ spec: { base }, intake }) =>
      base.source === "nda-copy" ? [{ contractId: base.contractId, intake }] : [],
    );
    expect(copies.length).toBeGreaterThan(0);
    for (const { contractId, intake } of copies) {
      const source = new URL(`../../../data/firm/contracts/${contractId}.md`, import.meta.url);
      expect(intake.markdown).toBe(await readFile(source, "utf8"));
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
