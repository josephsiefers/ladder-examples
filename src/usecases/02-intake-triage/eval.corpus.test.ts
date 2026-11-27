import { describe, expect, it } from "vitest";
import { createFirmDocuments, TITLE_EVIDENCE } from "../../core/documents";
import { createEvalStore, renderReport, runEval, SPLITS } from "../../core/eval";
import { createFakeLlm } from "../../core/llm";
import { createTriageEval } from "./eval";

const documents = createFirmDocuments();
const definition = createTriageEval({ documents });
const store = createEvalStore();
const cases = await store.loadCases(definition, "dev");

describe.each(SPLITS)("the triage eval's %s cases", (split) => {
  // The UC2 spec: every gold label carries evidence, the title plus the paragraphs that show primary purpose.
  it("cite the title first, and each evidence ID resolves to the document's title or paragraph text", async () => {
    const splitCases = await store.loadCases(definition, split);
    expect(splitCases.length).toBeGreaterThan(0);
    for (const evalCase of splitCases) {
      const document = await documents.readIntake(evalCase.input.documentId);
      const [title, ...ids] = evalCase.evidence?.docType ?? [];
      expect(title, `${evalCase.id} cites the title first`).toBe(TITLE_EVIDENCE);
      expect(await definition.evidenceText(evalCase.input, TITLE_EVIDENCE)).toBe(document.title);
      for (const id of ids) {
        const text = await definition.evidenceText(evalCase.input, id);
        expect(text).toBe(document.paragraphs.find((paragraph) => paragraph.id === id)?.text);
        expect(text?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe("the triage eval over the generated dev cases", () => {
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
