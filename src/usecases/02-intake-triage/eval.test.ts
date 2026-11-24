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

  it("reads gold as document type and ambiguity only", () => {
    expect(definition.goldSchema.safeParse({ docType: "msa", ambiguity: "hybrid" }).success).toBe(
      true,
    );
    expect(definition.goldSchema.safeParse({ docType: "msa" }).success).toBe(false);
    expect(definition.inputSchema.safeParse({ documentId: "" }).success).toBe(false);
  });
});
