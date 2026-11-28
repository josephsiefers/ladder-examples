import { describe, expect, it } from "vitest";
import type { IntakeDesk, IntakeDocument } from "../../core/documents";
import { buildReviewSheet, type EvalCase, runEval } from "../../core/eval";
import { createFakeLlm } from "../../core/llm";
import { createTriageEval, type TriageEvalInput, type TriageLabel } from "./eval";

/** An intake desk that only reads, holding `documents`. */
function readOnlyDesk(documents: IntakeDocument[]): IntakeDesk {
  return {
    async listIntake() {
      return documents.map((document) => document.id);
    },
    async readIntake(id) {
      const document = documents.find((each) => each.id === id);
      if (!document) throw new Error(`No intake document ${id}.`);
      return document;
    },
    routeToQueue() {
      throw new Error("The eval never routes.");
    },
  };
}

const MSA: IntakeDocument = {
  id: "intake-msa",
  title: "Master Services Agreement",
  paragraphs: [
    { id: "1.1", text: "The Supplier will provide software services under statements of work." },
    { id: "5.1", text: "Each party shall keep the other's Confidential Information confidential." },
  ],
};

const LETTER: IntakeDocument = {
  id: "intake-letter",
  title: "Letter of Intent",
  paragraphs: [{ text: "Dear Sirs, we propose to acquire your business." }],
};

/** 12 clean NDAs, `nda-01` to `nda-12`, each with one long paragraph. */
const NDAS: IntakeDocument[] = Array.from({ length: 12 }, (_, index) => ({
  id: `nda-${String(index + 1).padStart(2, "0")}`,
  title: "Mutual Non-Disclosure Agreement",
  paragraphs: [
    { id: "1.1", text: `${"Each party will protect what it receives. ".repeat(6)}End.` },
  ],
}));

const definition = createTriageEval({ documents: readOnlyDesk([MSA, LETTER, ...NDAS]) });

const evalCase = (
  id: string,
  gold: TriageLabel,
  evidence?: string[],
): EvalCase<TriageEvalInput, TriageLabel> => ({
  id,
  split: "smoke",
  input: { documentId: id },
  gold,
  ...(evidence && { evidence: { docType: evidence } }),
});

/** Plays a model that calls the MSA an NDA on run 2, and gets every other document right. */
const llm = createFakeLlm((request) => {
  if (request.prompt.includes("intake-msa")) {
    return { docType: request.sampleIndex === 1 ? "nda" : "msa", rationale: "Services." };
  }
  if (request.prompt.includes("intake-letter")) return { docType: "other", rationale: "LOI." };
  return { docType: "nda", rationale: "Confidentiality." };
});

async function sheetOf(cases: EvalCase<TriageEvalInput, TriageLabel>[], runs = 1) {
  const record = await runEval(definition, cases, { llm, split: "smoke", runs });
  const sheet = await buildReviewSheet(definition, record, cases);
  return { ...sheet, again: () => buildReviewSheet(definition, record, cases) };
}

/** The table rows (after the header and divider) of the section headed `heading`. */
function tableRows(markdown: string, heading: string): string[] {
  const section = `\n${markdown}`.split(`\n## ${heading}`)[1]?.split("\n## ")[0] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .slice(2);
}

const ndaCases = (count: number) =>
  NDAS.slice(0, count).map(({ id }) => evalCase(id, { docType: "nda", ambiguity: "clean" }));

describe("the triage review sheet", () => {
  it("has one row per document: its answer key, what each run said, and its title and evidence", async () => {
    const sheet = await sheetOf(
      [
        evalCase("intake-msa", { docType: "msa", ambiguity: "hybrid" }, ["title", "1.1", "5.1"]),
        evalCase("intake-letter", { docType: "other", ambiguity: "clean" }, ["title"]),
      ],
      2,
    );

    expect(sheet.markdown).toContain(
      [
        "For each row, do the title and evidence excerpt show what the answer key says? On disagreement rows, decide whether the model, the key, or neither is right.",
        "",
        "This is a reading check, not a legal one. ✗ marks a run that differed from the answer key.",
        "",
        "## Disagreements: 1 row",
        "",
        "| Document | Answer key | Model said (run 1) | Model said (run 2) | Title + evidence excerpt |",
        "| --- | --- | --- | --- | --- |",
        "| intake-msa | msa (hybrid) | msa | ✗ nda | [title] Master Services Agreement [1.1] The Supplier will provide software services under statements of work. [5.1] Each party shall keep the other's Confidential Information confidential. |",
        "",
        "## Agreeing rows: random sample of 1 of 1 (seed 1)",
        "",
        "| Document | Answer key | Model said (run 1) | Model said (run 2) | Title + evidence excerpt |",
        "| --- | --- | --- | --- | --- |",
        "| intake-letter | other (clean) | other | other | [title] Letter of Intent |",
        "",
      ].join("\n"),
    );
    expect(sheet.summary).toBe("1 disagreement row · random sample of 1 of 1 agreeing row");
  });

  it("cuts a long evidence paragraph to an excerpt", async () => {
    const sheet = await sheetOf(
      [evalCase("nda-01", { docType: "nda", ambiguity: "clean" }, ["1.1"])],
      1,
    );

    const excerpt = tableRows(sheet.markdown, "Agreeing rows")[0]?.split(" | ").at(-1);
    expect(excerpt).toBe(
      `[1.1] ${"Each party will protect what it receives. ".repeat(4).slice(0, 160).trimEnd()}… |`,
    );
  });

  it("lists every disagreement first, then a seeded sample of 8 agreeing rows", async () => {
    const cases = [
      ...ndaCases(12),
      evalCase("intake-msa", { docType: "msa", ambiguity: "hybrid" }),
    ];
    const sheet = await sheetOf(cases, 2);
    const sample = tableRows(sheet.markdown, "Agreeing rows");
    const allAgreeing = NDAS.map(
      ({ id }) => `| ${id} | nda (clean) | nda | nda | (no evidence recorded) |`,
    );

    expect(tableRows(sheet.markdown, "Disagreements")).toEqual([
      "| intake-msa | msa (hybrid) | msa | ✗ nda | (no evidence recorded) |",
    ]);
    expect(sample).toHaveLength(8);
    expect(allAgreeing.filter((line) => sample.includes(line))).toEqual(sample);
    expect(sheet.markdown).toContain("## Agreeing rows: random sample of 8 of 12 (seed 1)");
    expect((await sheet.again()).markdown).toBe(sheet.markdown);
  });

  it("shows every agreeing row when there are fewer than 8", async () => {
    const sheet = await sheetOf(ndaCases(3));

    expect(tableRows(sheet.markdown, "Agreeing rows")).toHaveLength(3);
    expect(sheet.summary).toBe("0 disagreement rows · random sample of 3 of 3 agreeing rows");
  });

  it("labels a document without an ambiguity by its type alone", () => {
    expect(definition.documentLabel?.({ docType: "nda" })).toBe("nda");
  });
});
