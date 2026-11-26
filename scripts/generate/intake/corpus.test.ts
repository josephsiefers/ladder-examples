import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DOC_TYPES } from "../../../src/core/documents";
import { coverage } from "../coverage";
import { assembleIntake } from "./assemble";
import { INTAKE_CORPUS, INTAKE_COVERAGE } from "./corpus";
import { readAsIntake } from "./intake.fixtures";
import { loadIntakeLibrary } from "./library";

const { specs, filesOf } = await INTAKE_CORPUS.load({});
const library = await loadIntakeLibrary();
const contractUrl = (id: string) =>
  new URL(`../../../data/firm/contracts/${id}.md`, import.meta.url);
const contracts = new Map(
  await Promise.all(
    specs.flatMap(({ base }) =>
      base.kind === "nda-copy"
        ? [
            readFile(contractUrl(base.contractId), "utf8").then(
              (text) => [base.contractId, text] as const,
            ),
          ]
        : [],
    ),
  ),
);
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

  it("copies each NDA byte for byte from UC1's corpus", async () => {
    const copies = built.filter(({ spec }) => spec.base.kind === "nda-copy");
    expect(copies.length).toBeGreaterThan(0);
    for (const { spec, intake } of copies) {
      const contractId = spec.base.kind === "nda-copy" ? spec.base.contractId : "";
      expect(intake.markdown).toBe(await readFile(contractUrl(contractId), "utf8"));
    }
  });

  it("cites, as evidence, the title and only paragraph IDs its document has", () => {
    for (const { intake, document } of built) {
      const [title, ...ids] = intake.goldCase.evidence.docType;
      const known = document.paragraphs.flatMap(({ id }) => (id === undefined ? [] : [id]));
      expect(title).toBe("title");
      expect(ids.length).toBeGreaterThan(0);
      expect(known).toEqual(expect.arrayContaining(ids));
    }
  });

  it("assembles each library document to 1–2 pages", () => {
    for (const { spec, document } of built.filter((entry) => entry.spec.base.kind === "library")) {
      const count = words(document.paragraphs);
      expect({ id: spec.id, inRange: count >= 400 && count <= 900 }).toEqual({
        id: spec.id,
        inRange: true,
      });
    }
  });

  it("gives no document an ID that names a document type", () => {
    for (const { id } of specs) {
      for (const type of DOC_TYPES) expect(id).not.toContain(type);
    }
  });
});
