import { describe, expect, it } from "vitest";
import { type CliDeps, run } from "./cli";
import { createFirmDocuments, type FirmDocuments, type RoutingRecord } from "./core/documents";
import { createEvalStore, type EvalStore } from "./core/eval";
import { createFakeLlm, createMemoryCacheStore, type StructuredRequest } from "./core/llm";

/** The real firm's documents, with routed records kept in memory instead of written out. */
function firmWithMemoryQueues(): { documents: FirmDocuments; routed: RoutingRecord[] } {
  const routed: RoutingRecord[] = [];
  const documents: FirmDocuments = {
    ...createFirmDocuments(),
    async routeToQueue({ documentId, queue, rationale }) {
      const record = { id: documentId, queue, rationale, routedAt: "2026-11-24T09:30:00.000Z" };
      routed.push(record);
      return { ...record, position: routed.filter((each) => each.queue === queue).length };
    },
  };
  return { documents, routed };
}

/** The real eval cases; run records are kept in memory. */
function memoryRecordStore(): EvalStore {
  const real = createEvalStore();
  return {
    ...real,
    saveRunRecord: async () => "reports/evals/triage-smoke.json",
  };
}

/** Plays a model that classifies every hand-written intake document by its number. */
const TYPES = ["nda", "msa", "dpa", "sow", "other"];
const answer = ({ prompt }: StructuredRequest<unknown>) => {
  const n = Number(/intake-hand-0(\d)/.exec(prompt)?.[1] ?? 1);
  return { docType: TYPES[n - 1], rationale: `Looks like a ${TYPES[n - 1]}.` };
};

function fakeDeps() {
  const out: string[] = [];
  const err: string[] = [];
  const { documents, routed } = firmWithMemoryQueues();
  const deps: CliDeps = {
    llm: createFakeLlm(answer, { usage: { inputTokens: 1200, outputTokens: 50 }, latencyMs: 900 }),
    llmCache: createMemoryCacheStore(),
    documents,
    evalStore: memoryRecordStore(),
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  };
  return { deps, out, err, routed };
}

const argv = (...args: string[]) => ["node", "ladder", ...args];

describe("ladder triage", () => {
  it("prints one document's classification and its queue, without routing it", async () => {
    const { deps, out, routed } = fakeDeps();

    expect(await run(argv("triage", "intake-hand-03"), deps)).toBe(0);

    expect(out).toEqual([
      JSON.stringify({ docType: "dpa", rationale: "Looks like a dpa." }, null, 2),
      "queue privacy (not routed; pass --route to file it)",
      "model claude-haiku-5-5 · 1,200 input tokens · 50 output tokens · 0.90 s",
    ]);
    expect(routed).toEqual([]);
  });

  it("routes one document when asked", async () => {
    const { deps, out, routed } = fakeDeps();

    expect(await run(argv("triage", "intake-hand-03", "--route"), deps)).toBe(0);

    expect(out[1]).toBe("routed to privacy (position 1, 2026-11-24T09:30:00.000Z)");
    expect(routed).toEqual([
      {
        id: "intake-hand-03",
        queue: "privacy",
        rationale: "Looks like a dpa.",
        routedAt: "2026-11-24T09:30:00.000Z",
      },
    ]);
  });

  it("triages and routes every document, one line each", async () => {
    const { deps, out } = fakeDeps();

    expect(await run(argv("triage", "--all", "--route"), deps)).toBe(0);

    expect(out).toEqual([
      "intake-hand-01 · nda → nda-review · routed (position 1)",
      "intake-hand-02 · msa → commercial · routed (position 1)",
      "intake-hand-03 · dpa → privacy · routed (position 1)",
      "intake-hand-04 · sow → commercial · routed (position 2)",
      "intake-hand-05 · other → senior-associate · routed (position 1)",
    ]);
  });

  it("triages every document without routing", async () => {
    const { deps, out } = fakeDeps();

    expect(await run(argv("triage", "--all"), deps)).toBe(0);

    expect(out[0]).toBe("intake-hand-01 · nda → nda-review · not routed");
  });

  it("needs exactly one of a document ID and --all", async () => {
    const neither = fakeDeps();
    expect(await run(argv("triage"), neither.deps)).toBe(1);
    expect(neither.err).toEqual(["error: Name one intake document ID, or pass --all."]);

    const both = fakeDeps();
    expect(await run(argv("triage", "intake-hand-01", "--all"), both.deps)).toBe(1);
  });

  it("reports an unknown document clearly", async () => {
    const { deps, err } = fakeDeps();

    expect(await run(argv("triage", "nope"), deps)).toBe(1);
    expect(err[0]).toMatch(/^error: Intake document 'nope' not found\. Known intake documents: /);
  });

  it("runs the triage eval on the smoke split with its matrix and clean vs hybrid table", async () => {
    const { deps, out } = fakeDeps();

    expect(await run(argv("eval", "triage", "--split", "smoke", "--runs", "1"), deps)).toBe(0);

    const report = out[0] ?? "";
    expect(report).toMatch(/^## Eval triage · split smoke · 5 cases × 1 run$/m);
    expect(report).toContain("| docType | 100.0% | 0.0% | 100.0% | 100.0% |");
    expect(report).toContain("| Gold \\ Predicted | nda | msa | dpa | sow | other |");
    expect(report).toContain("| hybrid | 100.0% | 2 |");
  });
});
