import { describe, expect, it } from "vitest";
import { createFakeLlm, InvalidOutputError } from "../../core/llm";
import { triageAll, triageDocument } from "./triage";
import { createFakeIntakeDesk, MSA_WITH_CONFIDENTIALITY } from "./triage.fixtures";

const classify = (docType: string) => () => ({
  docType,
  rationale: `Primary purpose: ${docType}.`,
});

describe("triageDocument", () => {
  it("classifies without routing unless asked, still naming the table's queue", async () => {
    const documents = createFakeIntakeDesk();
    const llm = createFakeLlm(classify("msa"), {
      usage: { inputTokens: 900, outputTokens: 60 },
      latencyMs: 700,
    });

    const result = await triageDocument("intake-msa", { llm, documents });

    expect(result).toEqual({
      documentId: "intake-msa",
      classification: { docType: "msa", rationale: "Primary purpose: msa." },
      queue: "commercial",
      model: "claude-haiku-5-5",
      usage: { inputTokens: 900, outputTokens: 60 },
      latencyMs: 700,
      cached: false,
    });
    expect(documents.routed).toEqual([]);
  });

  it("routes to the queue the routing table gives, with the model's rationale", async () => {
    const documents = createFakeIntakeDesk();
    const llm = createFakeLlm(classify("dpa"));

    const result = await triageDocument("intake-msa", { llm, documents }, { route: true });

    expect(documents.routed).toEqual([
      {
        id: "intake-msa",
        queue: "privacy",
        rationale: "Primary purpose: dpa.",
        routedAt: "2026-11-24T09:30:00.000Z",
      },
    ]);
    expect(result.receipt).toMatchObject({ id: "intake-msa", queue: "privacy", position: 1 });
  });

  it("takes the queue from the table even when the model names one", async () => {
    const documents = createFakeIntakeDesk();
    const llm = createFakeLlm(() => ({ docType: "nda", rationale: "x", queue: "privacy" }));

    const result = await triageDocument("intake-msa", { llm, documents }, { route: true });

    expect(result.queue).toBe("nda-review");
    expect(documents.routed[0]?.queue).toBe("nda-review");
  });

  it("prompts with the whole document and the type definitions, as sample 0 of Haiku", async () => {
    const llm = createFakeLlm(classify("msa"));

    await triageDocument("intake-msa", { llm, documents: createFakeIntakeDesk() });

    const call = llm.calls[0];
    expect(call).toMatchObject({
      model: "claude-haiku-5-5",
      schemaName: "intake-classification",
      sampleIndex: 0,
    });
    expect(call?.prompt).toContain('<intake-document id="intake-msa">');
    expect(call?.prompt).toContain(`[5.1] ${MSA_WITH_CONFIDENTIALITY.paragraphs[1]?.text}`);
    expect(call?.system).toMatch(/primary purpose/i);
    expect(call?.system).toMatch(/confidentiality section[\s\S]*msa/i);
  });

  it("passes the model and sample index options through", async () => {
    const llm = createFakeLlm(classify("msa"));

    await triageDocument(
      "intake-msa",
      { llm, documents: createFakeIntakeDesk() },
      { model: "claude-sonnet-5-5", sampleIndex: 2 },
    );

    expect(llm.calls[0]).toMatchObject({ model: "claude-sonnet-5-5", sampleIndex: 2 });
  });

  it("rejects a document type outside the union, routing nothing", async () => {
    const documents = createFakeIntakeDesk();
    const llm = createFakeLlm(classify("lease"));

    const triage = triageDocument("intake-msa", { llm, documents }, { route: true });

    await expect(triage).rejects.toThrow(InvalidOutputError);
    expect(documents.routed).toEqual([]);
  });

  it("does not call the model for an unknown document", async () => {
    const llm = createFakeLlm(classify("msa"));

    await expect(
      triageDocument("nope", { llm, documents: createFakeIntakeDesk() }),
    ).rejects.toThrow("Intake document 'nope' not found");
    expect(llm.calls).toEqual([]);
  });
});

describe("triageAll", () => {
  it("triages every intake document in order, routing each when asked", async () => {
    const documents = createFakeIntakeDesk();
    const llm = createFakeLlm((request) =>
      request.prompt.includes("intake-msa") ? classify("msa")() : classify("other")(),
    );

    const results = await triageAll({ llm, documents }, { route: true });

    expect(results.map((result) => [result.documentId, result.queue])).toEqual([
      ["intake-letter", "senior-associate"],
      ["intake-msa", "commercial"],
    ]);
    expect(documents.routed.map((routed) => routed.id)).toEqual(["intake-letter", "intake-msa"]);
  });
});
