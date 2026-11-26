import { describe, expect, it } from "vitest";
import { createFirmDocuments } from "../../core/documents";
import { createEvalStore, renderReport, runEval } from "../../core/eval";
import { createFakeLlm } from "../../core/llm";
import { createTriageEval } from "./eval";

const documents = createFirmDocuments();
const definition = createTriageEval({ documents });
const cases = await createEvalStore().loadCases(definition, "dev");

describe("the triage eval over the generated dev cases", () => {
  it("loads cases with evidence, and resolves each to the document's title or paragraph text", async () => {
    const generated = cases.filter(({ evidence }) => evidence !== undefined);
    expect(generated.length).toBeGreaterThan(0);
    for (const evalCase of generated) {
      const document = await documents.readIntake(evalCase.input.documentId);
      const [title, ...ids] = evalCase.evidence?.docType ?? [];
      expect(await definition.evidenceText(evalCase.input, title ?? "")).toBe(document.title);
      for (const id of ids) {
        const text = await definition.evidenceText(evalCase.input, id);
        expect(text).toBe(document.paragraphs.find((paragraph) => paragraph.id === id)?.text);
        expect(text?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("scores a model that answers every gold type at 100%", async () => {
    const llm = createFakeLlm(({ prompt }) => {
      const gold = cases.find(({ id }) => prompt.includes(`id="${id}"`))?.gold;
      return { docType: gold?.docType ?? "other", rationale: "Primary purpose." };
    });
    const record = await runEval(definition, cases, { llm, split: "dev", runs: 1 });
    const report = renderReport(record, definition.target, definition.analysis?.(record, cases));

    expect(report).toContain("| docType | 100.0% |");
    expect(report).toMatch(/\| clean \| 100\.0% \| \d+ \|/);
  });
});
