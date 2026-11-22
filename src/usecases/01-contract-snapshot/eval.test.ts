import { describe, expect, it } from "vitest";
import { createFirmDocuments } from "../../core/documents";
import { createEvalStore, type FieldStats } from "../../core/eval";
import { createFakeLlm } from "../../core/llm";
import { createSnapshotEval, snapshotTarget } from "./eval";
import { SNAPSHOT_FIELDS } from "./score";
import { SAMPLE_SNAPSHOT } from "./snapshot.fixtures";

const stat = (field: string, mean: number): FieldStats => ({
  field,
  perRun: [mean],
  mean,
  stdev: 0,
  min: mean,
  max: mean,
});

describe("snapshot eval", () => {
  it("runs one case as a snapshot of its contract, at the run's sample index", async () => {
    const llm = createFakeLlm(() => SAMPLE_SNAPSHOT);
    const definition = createSnapshotEval({ documents: createFirmDocuments() });

    const output = await definition.run({ contractId: "nda-sample-01" }, { llm, sampleIndex: 2 });

    expect(output).toEqual(SAMPLE_SNAPSHOT);
    expect(llm.calls[0]?.sampleIndex).toBe(2);
    expect(llm.calls[0]?.prompt).toContain('<contract id="nda-sample-01">');
  });

  it("is named snapshot and scores the six snapshot fields", () => {
    const definition = createSnapshotEval({ documents: createFirmDocuments() });

    expect(definition.name).toBe("snapshot");
    expect(definition.fields).toEqual([
      "parties",
      "effectiveDate",
      "term",
      "survivalPeriod",
      "governingLaw",
      "mutuality",
    ]);
    expect(definition.goldSchema.parse(SAMPLE_SNAPSHOT)).toEqual(SAMPLE_SNAPSHOT);
    expect(definition.inputSchema.safeParse({ contractId: "" }).success).toBe(false);
  });
});

describe("snapshot smoke cases", () => {
  it("are the four hand-written NDAs, each citing evidence paragraphs its contract has", async () => {
    const documents = createFirmDocuments();
    const cases = await createEvalStore().loadCases(createSnapshotEval({ documents }), "smoke");

    expect(cases.map((evalCase) => evalCase.id)).toEqual([
      "nda-sample-01",
      "nda-sample-02",
      "nda-sample-03",
      "nda-sample-04",
    ]);
    for (const evalCase of cases) {
      expect(evalCase.input.contractId).toBe(evalCase.id);
      const contract = await documents.readContract(evalCase.input.contractId);
      const paragraphIds = contract.sections.flatMap((section) =>
        section.paragraphs.map((paragraph) => paragraph.id),
      );
      expect(Object.keys(evalCase.evidence ?? {}).toSorted()).toEqual(
        [...SNAPSHOT_FIELDS].toSorted(),
      );
      for (const ids of Object.values(evalCase.evidence ?? {})) {
        for (const id of ids ?? []) expect(paragraphIds).toContain(id);
      }
    }
  });
});

describe("snapshotTarget", () => {
  const others = [stat("parties", 0.5), stat("survivalPeriod", 0.1)];

  it("is MET when the effective date and term both reach 98% on average", () => {
    const stats = [...others, stat("effectiveDate", 1), stat("term", 0.98)];

    expect(snapshotTarget(stats)).toBe("effectiveDate 100.0% · term 98.0% → target 98%: MET");
  });

  it("is NOT MET when either falls short", () => {
    expect(snapshotTarget([stat("effectiveDate", 1), stat("term", 0.963)])).toBe(
      "effectiveDate 100.0% · term 96.3% → target 98%: NOT MET",
    );
    expect(snapshotTarget([stat("effectiveDate", 0.979), stat("term", 1)])).toBe(
      "effectiveDate 97.9% · term 100.0% → target 98%: NOT MET",
    );
  });
});
