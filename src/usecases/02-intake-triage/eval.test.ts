import { describe, expect, it } from "vitest";
import { type EvalCase, renderReport, runEval } from "../../core/eval";
import { createFakeLlm } from "../../core/llm";
import { createTriageEval, type TriageEvalInput, type TriageLabel } from "./eval";
import { createFakeIntakeDesk } from "./triage.fixtures";

const definition = createTriageEval({ documents: createFakeIntakeDesk() });

const CASES: EvalCase<TriageEvalInput, TriageLabel>[] = [
  {
    id: "intake-msa",
    split: "smoke",
    input: { documentId: "intake-msa" },
    gold: { docType: "msa", ambiguity: "hybrid" },
  },
  {
    id: "intake-letter",
    split: "smoke",
    input: { documentId: "intake-letter" },
    gold: { docType: "other", ambiguity: "clean" },
  },
];

/** Plays a model that calls the MSA an NDA on run 1 and fails on the letter on run 0. */
const llm = createFakeLlm((request) => {
  if (request.prompt.includes("intake-msa")) {
    return { docType: request.sampleIndex === 1 ? "nda" : "msa", rationale: "Services." };
  }
  return request.sampleIndex === 0 ? { docType: "nope" } : { docType: "other", rationale: "LOI." };
});

/** One field's stats with the same accuracy in its only run. */
const stat = (field: string, mean: number) => ({
  field,
  perRun: [mean],
  mean,
  stdev: 0,
  min: mean,
  max: mean,
});

async function report() {
  const record = await runEval(definition, CASES, { llm, split: "smoke", runs: 2 });
  return renderReport(record, definition.target, definition.analysis?.(record, CASES));
}

describe("the triage eval", () => {
  it("scores the document type against gold", async () => {
    const text = await report();

    expect(text).toContain("| docType | 50.0% | 0.0% | 50.0% | 50.0% |");
    expect(text).toContain(
      "docType accuracy 50.0% (mean of runs) · upgrade trigger: hybrid accuracy materially below clean",
    );
  });

  it("reports overall accuracy, per-type precision and recall, and the confusion matrix", async () => {
    const text = await report();

    expect(text).toContain("Overall accuracy, pooled over 4 case runs: 50.0%");
    expect(text).toContain(
      [
        "| Type | Precision | Recall | Support |",
        "|---|---:|---:|---:|",
        "| nda | 0.0% | n/a | 0 |",
        "| msa | 100.0% | 50.0% | 2 |",
        "| dpa | n/a | n/a | 0 |",
        "| sow | n/a | n/a | 0 |",
        "| other | 100.0% | 50.0% | 2 |",
      ].join("\n"),
    );
    expect(text).toContain("| msa | 1 | 1 | 0 | 0 | 0 | 0 |");
    expect(text).toContain("| other | 0 | 0 | 0 | 0 | 1 | 1 |");
  });

  it("reports clean and hybrid accuracy separately", async () => {
    const text = await report();

    expect(text).toContain(
      [
        "| Ambiguity | Accuracy | Case runs |",
        "|---|---:|---:|",
        "| clean | 50.0% | 2 |",
        "| hybrid | 50.0% | 2 |",
      ].join("\n"),
    );
  });

  it("lays out the analysis section exactly", async () => {
    const clean = CASES.slice(1);
    const record = await runEval(definition, clean, { llm, split: "smoke", runs: 1 });

    expect(definition.analysis?.(record, clean)).toBe(
      [
        "Overall accuracy, pooled over 1 case run: 0.0%",
        "",
        "### Per type (pooled over all runs)",
        "",
        "| Type | Precision | Recall | Support |",
        "|---|---:|---:|---:|",
        "| nda | n/a | n/a | 0 |",
        "| msa | n/a | n/a | 0 |",
        "| dpa | n/a | n/a | 0 |",
        "| sow | n/a | n/a | 0 |",
        "| other | n/a | 0.0% | 1 |",
        "",
        "### Confusion matrix (pooled over all runs)",
        "",
        "| Gold \\ Predicted | nda | msa | dpa | sow | other | (no valid answer) |",
        "|---|---:|---:|---:|---:|---:|---:|",
        "| nda | 0 | 0 | 0 | 0 | 0 | 0 |",
        "| msa | 0 | 0 | 0 | 0 | 0 | 0 |",
        "| dpa | 0 | 0 | 0 | 0 | 0 | 0 |",
        "| sow | 0 | 0 | 0 | 0 | 0 | 0 |",
        "| other | 0 | 0 | 0 | 0 | 0 | 1 |",
        "",
        "### Clean vs hybrid",
        "",
        "| Ambiguity | Accuracy | Case runs |",
        "|---|---:|---:|",
        "| clean | 0.0% | 1 |",
        "| hybrid | n/a | 0 |",
      ].join("\n"),
    );
  });

  it("reads the docType field's mean for the target line, whatever else is in the stats", () => {
    expect(definition.target([stat("other", 0.1), stat("docType", 0.8)])).toMatch(
      /^docType accuracy 80\.0% \(mean of runs\)/,
    );
    expect(definition.target([])).toMatch(/^docType accuracy 0\.0%/);
  });

  it("says n/a for an empty group", async () => {
    const clean = CASES.slice(1);
    const record = await runEval(definition, clean, { llm, split: "smoke", runs: 1 });

    expect(definition.analysis?.(record, clean)).toContain("| hybrid | n/a | 0 |");
  });

  it("finds a numbered evidence paragraph's text, and none for an unknown ID", async () => {
    const input = { documentId: "intake-msa" };

    expect(await definition.evidenceText(input, "5.1")).toBe(
      "Each party shall keep the other's Confidential Information confidential.",
    );
    expect(await definition.evidenceText(input, "9.9")).toBeUndefined();
  });

  it("cites the document's title by the evidence ID `title`", async () => {
    expect(await definition.evidenceText({ documentId: "intake-msa" }, "title")).toBe(
      "Master Services Agreement",
    );
  });

  it("shows the answer key as type and ambiguity, and the model's answer as its type", () => {
    expect(definition.describe({ docType: "msa", ambiguity: "hybrid" })).toEqual({
      docType: "msa (hybrid)",
    });
    expect(definition.describe({ docType: "nda", rationale: "Secrets." })).toEqual({
      docType: "nda",
    });
  });

  it("lays out its review sheet by document, with 8 agreeing rows sampled", () => {
    expect(definition.reviewSheet).toEqual({
      sampleSize: 8,
      fieldColumn: false,
      headers: {
        case: "Document",
        expected: "Answer key (type, clean/hybrid)",
        source: "Title + evidence excerpt",
      },
    });
  });

  it("reads gold as document type and ambiguity only", () => {
    expect(definition.goldSchema.safeParse({ docType: "msa", ambiguity: "hybrid" }).success).toBe(
      true,
    );
    expect(definition.goldSchema.safeParse({ docType: "msa" }).success).toBe(false);
    expect(definition.inputSchema.safeParse({ documentId: "" }).success).toBe(false);
  });
});
