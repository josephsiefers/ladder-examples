import { describe, expect, it } from "vitest";
import { ContractNotFoundError, createFirmDocuments } from "../../core/documents";
import { createFakeLlm, InvalidOutputError } from "../../core/llm";
import { snapshotContract } from "./snapshot";
import { SAMPLE_SNAPSHOT as SNAPSHOT } from "./snapshot.fixtures";

const documents = createFirmDocuments();

describe("snapshotContract", () => {
  it("puts every paragraph of the contract, with its marker, into the prompt", async () => {
    const llm = createFakeLlm(() => SNAPSHOT);
    const contract = await documents.readContract("nda-sample-01");

    await snapshotContract("nda-sample-01", { llm, documents });

    const prompt = llm.calls[0]?.prompt ?? "";
    const paragraphs = contract.sections.flatMap((section) => section.paragraphs);
    expect(paragraphs.length).toBeGreaterThan(20);
    for (const paragraph of paragraphs) {
      expect(prompt).toContain(`[${paragraph.id}] ${paragraph.text}`);
    }
  });

  it("returns the validated snapshot with the call's model, usage and latency", async () => {
    const llm = createFakeLlm(() => SNAPSHOT, {
      usage: { inputTokens: 2100, outputTokens: 140 },
      latencyMs: 1800,
    });

    const result = await snapshotContract("nda-sample-01", { llm, documents });

    expect(result).toEqual({
      snapshot: SNAPSHOT,
      model: "claude-haiku-5-5",
      usage: { inputTokens: 2100, outputTokens: 140 },
      latencyMs: 1800,
    });
  });

  it("asks for the snapshot schema with the field definitions, as sample 0 of Haiku by default", async () => {
    const llm = createFakeLlm(() => SNAPSHOT);

    await snapshotContract("nda-sample-01", { llm, documents });

    expect(llm.calls[0]).toMatchObject({
      model: "claude-haiku-5-5",
      schemaName: "contract-snapshot",
      sampleIndex: 0,
    });
    expect(llm.calls[0]?.system).toContain("and its Affiliates");
  });

  it("passes the model and sample index options through", async () => {
    const llm = createFakeLlm(() => SNAPSHOT);

    await snapshotContract(
      "nda-sample-01",
      { llm, documents },
      { model: "claude-sonnet-5-5", sampleIndex: 2 },
    );

    expect(llm.calls[0]).toMatchObject({ model: "claude-sonnet-5-5", sampleIndex: 2 });
  });

  it("rejects an invalid snapshot", async () => {
    const llm = createFakeLlm(() => ({ ...SNAPSHOT, governingLaw: "scotland" }));

    const snapshot = snapshotContract("nda-sample-01", { llm, documents });

    await expect(snapshot).rejects.toThrow(InvalidOutputError);
    await expect(snapshot).rejects.toThrow(/contract-snapshot.*governingLaw/s);
  });

  it("does not call the model for an unknown contract", async () => {
    const llm = createFakeLlm(() => SNAPSHOT);

    await expect(snapshotContract("does-not-exist", { llm, documents })).rejects.toThrow(
      ContractNotFoundError,
    );
    expect(llm.calls).toEqual([]);
  });
});
