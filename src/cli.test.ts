import { describe, expect, it } from "vitest";
import { buildProgram, type CliDeps, run } from "./cli";
import { createFirmDocuments } from "./core/documents";
import { EmptySplitError, type EvalStore, type RunRecord, type Split } from "./core/eval";
import { createFakeLlm } from "./core/llm";

const SNAPSHOT = {
  parties: [
    { name: "Kestrel Bioanalytics Limited", role: "both" },
    { name: "Marlow Data Systems Ltd", role: "both" },
  ],
  effectiveDate: { kind: "date", value: "2025-03-03" },
  term: { kind: "fixed", months: 24 },
  survivalPeriod: { kind: "fixed", months: 60 },
  governingLaw: "england-and-wales",
  mutuality: "mutual",
};

/** An in-memory eval store holding one gold case per split listed. */
function fakeEvalStore(splits: Split[]) {
  const saved: RunRecord[] = [];
  const store: EvalStore = {
    async loadCases(definition, split) {
      if (!splits.includes(split)) throw new EmptySplitError(definition.name, split);
      const input = { contractId: "nda-sample-01" };
      return [{ id: "nda-sample-01", split, input, gold: SNAPSHOT }] as never;
    },
    async saveRunRecord(record) {
      saved.push(record);
      return `${process.cwd()}/reports/evals/${record.eval}-${record.split}.json`;
    },
  };
  return { store, saved };
}

function fakeDeps({ splits = ["smoke", "dev"] }: { splits?: Split[] } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const llm = createFakeLlm(() => SNAPSHOT, {
    usage: { inputTokens: 2400, outputTokens: 150 },
    latencyMs: 1500,
  });
  const evals = fakeEvalStore(splits);
  const deps: CliDeps = {
    llm,
    documents: createFirmDocuments(),
    evalStore: evals.store,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  };
  return { deps, llm, out, err, saved: evals.saved };
}

const argv = (...args: string[]) => ["node", "ladder", ...args];

describe("ladder CLI", () => {
  it("is named ladder", () => {
    expect(buildProgram(fakeDeps().deps).name()).toBe("ladder");
  });

  it("reports a semver version", () => {
    expect(buildProgram(fakeDeps().deps).version()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("describes the project in its help", () => {
    const help = buildProgram(fakeDeps().deps).helpInformation();
    expect(help).toContain("Usage: ladder");
    expect(help).toContain("A worked example of the design ladder");
  });

  describe("snapshot", () => {
    it("prints the contract snapshot, then the call's model, tokens and latency", async () => {
      const { deps, out } = fakeDeps();

      const code = await run(argv("snapshot", "nda-sample-01"), deps);

      expect(code).toBe(0);
      expect(out).toEqual([
        JSON.stringify(SNAPSHOT, null, 2),
        "model claude-haiku-5-5 · 2,400 input tokens · 150 output tokens · 1.50 s",
      ]);
    });

    it("prints a clear error and exits 1 for an unknown contract", async () => {
      const { deps, out, err } = fakeDeps();

      const code = await run(argv("snapshot", "does-not-exist"), deps);

      expect(code).toBe(1);
      expect(out).toEqual([]);
      expect(err).toEqual([
        "error: Contract 'does-not-exist' not found. Known contracts: nda-sample-01, nda-sample-02, nda-sample-03, nda-sample-04.",
      ]);
    });
  });

  describe("eval", () => {
    it("runs every case of the split N times and prints the report", async () => {
      const { deps, llm, out, saved } = fakeDeps();

      const code = await run(argv("eval", "snapshot", "--split", "smoke", "--runs", "2"), deps);

      expect(code).toBe(0);
      expect(llm.calls.map((call) => call.sampleIndex).toSorted()).toEqual([0, 1]);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ eval: "snapshot", split: "smoke", runs: 2, concurrency: 4 });
      const [report, recordLine] = out;
      expect(report).toMatch(/^## Eval snapshot · split smoke · 1 case × 2 runs\n/);
      expect(report).toContain("| effectiveDate | 100.0% | 0.0% | 100.0% | 100.0% |");
      expect(report).toContain("effectiveDate 100.0% · term 100.0% → target 98%: MET");
      expect(report).toContain("### Failures\n\nNone.");
      expect(report).toContain("Totals: 2 calls · 4,800 input tokens · 300 output tokens");
      expect(recordLine).toBe("\nRun record: reports/evals/snapshot-smoke.json");
    });

    it("defaults to the dev split, 3 runs and 4 at a time", async () => {
      const { deps, saved } = fakeDeps();

      expect(await run(argv("eval", "snapshot"), deps)).toBe(0);

      expect(saved[0]).toMatchObject({ split: "dev", runs: 3, concurrency: 4 });
    });

    it("passes the concurrency through", async () => {
      const { deps, saved } = fakeDeps();

      await run(argv("eval", "snapshot", "--concurrency", "2"), deps);

      expect(saved[0]?.concurrency).toBe(2);
    });

    it("says clearly when the split has no cases", async () => {
      const { deps, llm, out, err } = fakeDeps({ splits: ["smoke"] });

      const code = await run(argv("eval", "snapshot"), deps);

      expect(code).toBe(1);
      expect(err).toEqual(["error: Eval 'snapshot': split dev has no cases yet."]);
      expect(out).toEqual([]);
      expect(llm.calls).toEqual([]);
    });

    it.each([
      { problem: "an unknown eval", args: ["eval", "triage"], message: /snapshot/ },
      {
        problem: "an unknown split",
        args: ["eval", "snapshot", "--split", "train"],
        message: /smoke, dev, test/,
      },
      { problem: "zero runs", args: ["eval", "snapshot", "--runs", "0"], message: /at least 1/ },
      {
        problem: "a fractional concurrency",
        args: ["eval", "snapshot", "--concurrency", "1.5"],
        message: /whole number/,
      },
    ])("rejects $problem without calling the model", async ({ args, message }) => {
      const { deps, llm, err } = fakeDeps();

      const code = await run(argv(...args), deps);

      expect(code).toBe(1);
      expect(err.join("\n")).toMatch(message);
      expect(llm.calls).toEqual([]);
    });
  });
});
