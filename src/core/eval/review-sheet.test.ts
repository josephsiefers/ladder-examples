import { describe, expect, it } from "vitest";
import { caseRun, runRecord } from "./eval.fixtures";
import { buildReviewSheet } from "./review-sheet";
import type { EvalCase } from "./types";

type Input = { doc: string };

/** Each case's document: paragraph ID → text. */
const DOCS: Record<string, Record<string, string>> = {
  x: { "1.1": "X is red.", "2.1": "X is big." },
  y: { "1.1": "Y is blue.", "2.1": "Y is small." },
};

const definition = {
  async evidenceText({ doc }: Input, paragraphId: string) {
    return DOCS[doc]?.[paragraphId];
  },
};

const evalCase = (
  id: string,
  evidence?: EvalCase<Input, unknown>["evidence"],
): EvalCase<Input, unknown> => ({
  id,
  split: "dev",
  input: { doc: id },
  gold: {},
  ...(evidence && { evidence }),
});

const CASES = [
  evalCase("x", { colour: ["1.1"], size: ["2.1"] }),
  evalCase("y", { colour: ["1.1"], size: ["2.1"] }),
];

/** The table rows (after the header and divider) of the section headed `heading`. */
function tableRows(markdown: string, heading: string): string[] {
  const section = `\n${markdown}`.split(`\n## ${heading}`)[1]?.split("\n## ")[0] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .slice(2);
}

/** The source sentence of the one row of a single-case, single-field sheet. */
const sourceOf = async (evidence: EvalCase<Input, unknown>["evidence"], caseId = "x") => {
  const record = runRecord([caseRun("x", 0, { colour: false })]);
  const sheet = await buildReviewSheet(definition, record, [evalCase(caseId, evidence)]);
  return tableRows(sheet.markdown, "Disagreements")[0]?.split(" | ").at(-1);
};

/** A definition with a document-level label whose every evidence paragraph is `text`. */
const longDocs = (text: string) => ({
  async evidenceText() {
    return text;
  },
  documentLabel: () => "label",
});

describe("buildReviewSheet", () => {
  it("lists disagreements before agreeing rows; one run differing makes a disagreement", async () => {
    const record = runRecord([
      caseRun("x", 0, { colour: true, size: true }),
      caseRun("y", 0, { colour: true, size: true }),
      caseRun("x", 1, { colour: true, size: true }),
      caseRun("y", 1, { colour: true, size: false }),
    ]);

    const sheet = await buildReviewSheet(definition, record, CASES);

    expect(tableRows(sheet.markdown, "Disagreements")).toEqual([
      "| y | size | gold | gold | ✗ something else | [2.1] Y is small. |",
    ]);
    expect(tableRows(sheet.markdown, "Agreeing rows")).toEqual([
      "| x | colour | gold | gold | gold | [1.1] X is red. |",
      "| x | size | gold | gold | gold | [2.1] X is big. |",
      "| y | colour | gold | gold | gold | [1.1] Y is blue. |",
    ]);
    expect(sheet.markdown.indexOf("## Disagreements")).toBeLessThan(
      sheet.markdown.indexOf("## Agreeing rows"),
    );
    expect(sheet.summary).toBe("1 disagreement row · random sample of 3 of 3 agreeing rows");
  });

  it("opens with the run it reviews and how to read it, then both tables", async () => {
    const record = runRecord(
      [
        caseRun("x", 0, { colour: false, size: true }),
        caseRun("x", 1, { colour: true, size: true }),
      ],
      { eval: "toy", split: "dev", startedAt: "2026-11-22T09:00:00.000Z" },
    );

    const sheet = await buildReviewSheet(definition, record, [
      CASES[0] as EvalCase<Input, unknown>,
    ]);

    expect(sheet.markdown).toBe(
      [
        "# Review sheet: eval toy · split dev · run of 2026-11-22T09:00:00.000Z",
        "",
        "For each row, does the source sentence say what the answer key says? On disagreement rows, decide whether the model, the key, or neither is right.",
        "",
        "This is a reading check, not a legal one. ✗ marks a run that differed from the answer key.",
        "",
        "## Disagreements: 1 row",
        "",
        "| Case | Field | Answer key says | Model said (run 1) | Model said (run 2) | Source sentence |",
        "| --- | --- | --- | --- | --- | --- |",
        "| x | colour | gold | ✗ something else | gold | [1.1] X is red. |",
        "",
        "## Agreeing rows: random sample of 1 of 1 (seed 1)",
        "",
        "| Case | Field | Answer key says | Model said (run 1) | Model said (run 2) | Source sentence |",
        "| --- | --- | --- | --- | --- | --- |",
        "| x | size | gold | gold | gold | [2.1] X is big. |",
        "",
      ].join("\n"),
    );
  });

  it("says None for an empty table", async () => {
    const record = runRecord([caseRun("x", 0, { colour: true })]);

    const sheet = await buildReviewSheet(definition, record, CASES, { sampleSize: 0 });

    expect(sheet.markdown).toContain("## Disagreements: 0 rows\n\nNone.\n");
    expect(sheet.markdown).toContain(
      "## Agreeing rows: random sample of 0 of 1 (seed 1)\n\nNone.\n",
    );
  });

  describe("the source sentence", () => {
    it("is the text of each evidence paragraph, marked with its ID", async () => {
      expect(await sourceOf({ colour: ["1.1", "2.1"] })).toBe("[1.1] X is red. [2.1] X is big. |");
    });

    it("says the field should be absent when the answer key cites no paragraph for it", async () => {
      expect(await sourceOf({ size: ["2.1"] })).toBe("(no sentence: field should be absent) |");
    });

    it("says so when a cited paragraph does not exist", async () => {
      expect(await sourceOf({ colour: ["9.9"] })).toBe("[9.9] (no such paragraph) |");
    });
  });

  it("refuses a record whose case is not in the dataset", async () => {
    await expect(sourceOf({ colour: ["1.1"] }, "z")).rejects.toThrow(
      "Run record case 'x' is not in the dataset; the answer key may have changed since the run.",
    );
  });

  it("refuses a record whose missing case would not even appear on the sheet", async () => {
    const record = runRecord([
      caseRun("x", 0, { colour: true }),
      caseRun("z", 0, { colour: true }),
    ]);

    await expect(buildReviewSheet(definition, record, CASES, { sampleSize: 0 })).rejects.toThrow(
      "Run record case 'z' is not in the dataset",
    );
  });

  describe("the random sample of agreeing rows", () => {
    /** 8 cases × 2 fields, all agreeing: 16 rows. */
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const record = runRecord(ids.map((id) => caseRun(id, 0, { colour: true, size: true })));
    const cases = ids.map((id) => evalCase(id));
    const sampleOf = async (options?: { seed?: number }) =>
      tableRows((await buildReviewSheet(definition, record, cases, options)).markdown, "Agreeing");
    const allRows = ids.flatMap((id) => [
      `| ${id} | colour | gold | gold | (no evidence recorded) |`,
      `| ${id} | size | gold | gold | (no evidence recorded) |`,
    ]);

    it("holds 10 distinct agreeing rows, shown in case then field order", async () => {
      const sample = await sampleOf();

      expect(sample).toHaveLength(10);
      expect(new Set(sample).size).toBe(10);
      expect(allRows.filter((line) => sample.includes(line))).toEqual(sample);
    });

    it("is the same every time for one seed, and differs for another", async () => {
      expect(await sampleOf()).toEqual(await sampleOf());
      expect(await sampleOf({ seed: 7 })).toEqual(await sampleOf({ seed: 7 }));
      expect(await sampleOf({ seed: 7 })).not.toEqual(await sampleOf());
    });

    it("says how many agreeing rows it shows, and the seed", async () => {
      const sheet = await buildReviewSheet(definition, record, cases, { seed: 7 });

      expect(sheet.markdown).toContain("## Agreeing rows: random sample of 10 of 16 (seed 7)");
      expect(sheet.summary).toBe("0 disagreement rows · random sample of 10 of 16 agreeing rows");
    });
  });

  describe("with a document-level label", () => {
    const labelled = {
      ...definition,
      documentLabel: (gold: unknown) => `label of ${String(gold)}`,
    };

    it("has one row per case; a run differing on any field makes it a disagreement", async () => {
      const record = runRecord([
        caseRun("x", 0, { colour: true, size: false }),
        caseRun("y", 0, { colour: true, size: true }),
      ]);
      const cases = [evalCase("x"), evalCase("y")].map((each) => ({ ...each, gold: each.id }));

      const sheet = await buildReviewSheet(labelled, record, cases);

      expect(tableRows(sheet.markdown, "Disagreements")).toEqual([
        "| x | label of x | ✗ gold · something else | (no evidence recorded) |",
      ]);
      expect(tableRows(sheet.markdown, "Agreeing rows")).toEqual([
        "| y | label of y | gold · gold | (no evidence recorded) |",
      ]);
    });

    it("cuts each evidence paragraph over 160 characters to an excerpt", async () => {
      const record = runRecord([caseRun("x", 0, { colour: true })]);
      const cases = [evalCase("x", { colour: ["1.1"] })];
      const excerptOf = async (text: string) =>
        tableRows((await buildReviewSheet(longDocs(text), record, cases)).markdown, "Agreeing")[0]
          ?.split(" | ")
          .at(-1);
      const exact = "a".repeat(160);

      expect(await excerptOf(exact)).toBe(`[1.1] ${exact} |`);
      expect(await excerptOf(`${"a".repeat(159)} bc`)).toBe(`[1.1] ${"a".repeat(159)}… |`);
    });
  });
});
