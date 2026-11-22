import { beforeAll, describe, expect, it } from "vitest";
import type { Contract } from "../../src/core/documents";
import { assembleNda } from "./assemble";
import { MUTUAL_SPEC, readAsFirmContract, WORKED_SPEC } from "./generate.fixtures";
import { type Library, loadLibrary } from "./library";

let library: Library;

beforeAll(async () => {
  library = await loadLibrary();
});

function paragraphText(contract: Contract, id: string): string {
  const paragraph = contract.sections
    .flatMap(({ paragraphs }) => paragraphs)
    .find((p) => p.id === id);
  if (!paragraph) throw new Error(`no paragraph ${id}`);
  return paragraph.text;
}

describe("assembleNda", () => {
  it("writes a contract in the firm's format, opening with the parties and ending with signatures", async () => {
    const nda = assembleNda(WORKED_SPEC, library);
    const contract = await readAsFirmContract(nda);
    expect(nda.contractId).toBe("nda-worked");
    expect(["Non-Disclosure Agreement", "Confidentiality Agreement"]).toContain(contract.title);
    expect(contract.sections[0]?.heading).toBe("Parties and Background");
    expect(contract.sections.at(-1)?.heading).toBe("Signatures");
    // Parties and Background, 16 clause sections, Signatures.
    expect(contract.sections).toHaveLength(18);
  });

  it("renders the planted values into the contract", () => {
    const { markdown } = assembleNda(WORKED_SPEC, library);
    expect(markdown).toContain("Kestrel Bioanalytics Limited and its Affiliates");
    expect(markdown).toMatch(
      /the 3rd day of March 2025|the third day of March, two thousand and twenty-five/,
    );
    expect(markdown).toContain("two (2) years");
    expect(markdown).toContain("five (5) years");
    expect(markdown).toContain("mutual discussions");
    expect(markdown).toContain("the laws of England and Wales");
    expect(markdown).toContain("the courts of the Republic of Singapore");
  });

  it.each([7, 8, 9, 10])(
    "words a like-term survival period the same way as the term (seed %i)",
    (seed) => {
      const { markdown } = assembleNda({ ...WORKED_SPEC, seed }, library);
      const lead = (duration: string) => new RegExp(`(\\w+ \\w+) ${duration}`).exec(markdown)?.[1];
      expect(lead("two \\(2\\) years")).toBeDefined();
      expect(lead("five \\(5\\) years")).toBe(lead("two \\(2\\) years"));
    },
  );

  it("computes the gold snapshot from the spec", () => {
    expect(assembleNda(WORKED_SPEC, library).goldCase.gold).toEqual({
      parties: [
        { name: "Kestrel Bioanalytics Limited", role: "discloser" },
        { name: "Marlow Data Systems Ltd", role: "recipient" },
      ],
      effectiveDate: { kind: "date", value: "2025-03-03" },
      term: { kind: "fixed", months: 24 },
      survivalPeriod: { kind: "fixed", months: 60 },
      governingLaw: "england-and-wales",
      mutuality: "one-way",
    });
    expect(assembleNda(MUTUAL_SPEC, library).goldCase.gold).toEqual({
      parties: [
        { name: "Brightwater Analytics, Inc.", role: "both" },
        { name: "Solano Grid Technologies LLC", role: "both" },
      ],
      effectiveDate: { kind: "not-stated" },
      term: { kind: "until-terminated", noticeDays: 30 },
      survivalPeriod: { kind: "indefinite" },
      governingLaw: "california",
      mutuality: "mutual",
    });
  });

  it("records the paragraph where each value landed", async () => {
    const nda = assembleNda(WORKED_SPEC, library);
    const { goldCase } = nda;
    const contract = await readAsFirmContract(nda);
    expect(goldCase.input).toEqual({ contractId: "nda-worked" });
    // Section 1: parties, effective date, the "mutual discussions" recital, then the one-way grant.
    expect(goldCase.evidence.parties).toEqual(["1.1"]);
    expect(goldCase.evidence.effectiveDate).toEqual(["1.2"]);
    expect(goldCase.evidence.mutuality).toEqual(["1.4"]);
    const [term] = goldCase.evidence.term ?? [];
    const [survival] = goldCase.evidence.survivalPeriod ?? [];
    expect(paragraphText(contract, term ?? "")).toContain("two (2) years");
    expect(paragraphText(contract, survival ?? "")).toContain("five (5) years");
    expect(paragraphText(contract, survival ?? "")).not.toContain("two (2) years");
    const [law] = goldCase.evidence.governingLaw ?? [];
    expect(paragraphText(contract, law ?? "")).toContain("the laws of England and Wales");
  });

  it("records the values as rendered into their evidence paragraphs", () => {
    const { rendered } = assembleNda(WORKED_SPEC, library);
    expect(rendered.parties).toEqual([
      "Kestrel Bioanalytics Limited and its Affiliates",
      "Marlow Data Systems Ltd",
    ]);
    expect(rendered.mutuality).toEqual(["Kestrel", "Marlow"]);
    expect(rendered.term).toEqual(["two (2) years"]);
    expect(rendered.survivalPeriod).toEqual(["five (5) years"]);
    expect(rendered.governingLaw).toEqual(["the laws of England and Wales"]);
    const { rendered: mutual } = assembleNda(MUTUAL_SPEC, library);
    expect(mutual.term).toEqual(["thirty (30) days'"]);
    // Nothing value-like is filled in for these, so every paragraph of the wording is evidence.
    expect(mutual.mutuality).toEqual([]);
    expect(mutual.survivalPeriod).toEqual([]);
  });

  it("fails generation when standard clause wording uses a placeholder, even one with a value", () => {
    const broken: Library = structuredClone(library);
    broken.clauses.remedies = {
      "standard-x": { heading: "Remedies", paragraphs: ["For {{purpose}}."] },
    };
    expect(() => assembleNda(WORKED_SPEC, broken)).toThrow(
      "Template 'clauses/remedies/standard-x': unknown placeholder {{purpose}}.",
    );
  });

  it("records no evidence for a value the contract does not state, and never mentions it", () => {
    const { markdown, goldCase } = assembleNda(MUTUAL_SPEC, library);
    expect(Object.keys(goldCase.evidence)).toEqual([
      "parties",
      "term",
      "survivalPeriod",
      "governingLaw",
      "mutuality",
    ]);
    expect(markdown).not.toContain("Effective Date");
  });

  it("is byte-identical on re-run, and a different seed changes the clause order", () => {
    const first = assembleNda(WORKED_SPEC, library).markdown;
    expect(assembleNda(WORKED_SPEC, library).markdown).toBe(first);
    expect(assembleNda({ ...WORKED_SPEC, seed: 8 }, library).markdown).not.toBe(first);
  });

  it("fails generation when a library phrasing uses an unknown placeholder", () => {
    const broken: Library = structuredClone(library);
    broken.phrasings.term.fixed = [["This Agreement runs for {{term.length}}."]];
    expect(() => assembleNda(WORKED_SPEC, broken)).toThrow(
      "Template 'term/fixed': unknown placeholder {{term.length}}.",
    );
  });

  it("fails generation when a phrasing needs a value the spec does not plant", () => {
    // A fixed term has no notice period, so the until-terminated wording cannot be filled.
    const broken: Library = structuredClone(library);
    broken.phrasings.term.fixed = [["Terminable on {{term.notice}} notice."]];
    expect(() => assembleNda(WORKED_SPEC, broken)).toThrow("unknown placeholder {{term.notice}}");
  });
});
