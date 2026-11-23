import { describe, expect, it } from "vitest";
import { buildProgram, type CliDeps, run } from "./cli";
import { createFirmDocuments } from "./core/documents";
import {
  EmptySplitError,
  type EvalStore,
  NoRunRecordError,
  type RunRecord,
  type Split,
} from "./core/eval";
import {
  type CacheStore,
  createFakeLlm,
  createMemoryCacheStore,
  type StructuredRequest,
} from "./core/llm";

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

/** An in-memory eval store holding one gold case per split listed; saved records are kept by path. */
function fakeEvalStore(splits: Split[]) {
  const saved: RunRecord[] = [];
  const records = new Map<string, RunRecord>();
  const sheets = new Map<string, string>();
  const recordPath = (record: RunRecord) =>
    `${process.cwd()}/reports/evals/${record.eval}-${record.split}-${saved.indexOf(record)}.json`;
  const store: EvalStore = {
    async loadCases(definition, split) {
      if (!splits.includes(split)) throw new EmptySplitError(definition.name, split);
      const input = { contractId: "nda-sample-01" };
      const evidence = { effectiveDate: ["1.1"], term: ["9.1"] };
      return [{ id: "nda-sample-01", split, input, gold: SNAPSHOT, evidence }] as never;
    },
    async saveRunRecord(record) {
      saved.push(record);
      const path = recordPath(record);
      records.set(path, record);
      return path;
    },
    async latestRunRecord(evalName, split) {
      const record = saved.findLast((each) => each.eval === evalName && each.split === split);
      if (!record) throw new NoRunRecordError(evalName, split);
      return { record, path: recordPath(record) };
    },
    async loadRunRecord(path) {
      const record = records.get(path);
      if (!record) throw new Error(`ENOENT: ${path}`);
      return { record, path };
    },
    async saveReviewSheet(record, markdown) {
      const path = recordPath(record).replace(/\.json$/, ".review-sheet.md");
      sheets.set(path, markdown);
      return path;
    },
  };
  return { store, saved, sheets };
}

function fakeDeps({
  splits = ["smoke", "dev"],
  llmCache = createMemoryCacheStore(),
  answer = () => SNAPSHOT,
}: {
  splits?: Split[];
  llmCache?: CacheStore;
  answer?: (request: StructuredRequest<unknown>) => unknown;
} = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const llm = createFakeLlm(answer, {
    usage: { inputTokens: 2400, outputTokens: 150 },
    latencyMs: 1500,
  });
  const evals = fakeEvalStore(splits);
  const deps: CliDeps = {
    llm,
    llmCache,
    documents: createFirmDocuments(),
    evalStore: evals.store,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  };
  return { deps, llm, out, err, saved: evals.saved, sheets: evals.sheets };
}

const argv = (...args: string[]) => ["node", "ladder", ...args];

/** An eval report without its totals line, which differs between live and cached runs. */
const table = (report = "") => report.split("\n\nTotals:")[0];

/** The model gets the effective date wrong in the second run. */
const answer = ({ sampleIndex }: StructuredRequest<unknown>) =>
  sampleIndex === 1 ? { ...SNAPSHOT, effectiveDate: { kind: "last-signature" } } : SNAPSHOT;

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

    it("replays a repeated call from the cache and says so", async () => {
      const llmCache = createMemoryCacheStore();
      await run(argv("snapshot", "nda-sample-01"), fakeDeps({ llmCache }).deps);
      const { deps, llm, out } = fakeDeps({ llmCache });

      expect(await run(argv("snapshot", "nda-sample-01"), deps)).toBe(0);

      expect(llm.calls).toEqual([]);
      expect(out).toEqual([
        JSON.stringify(SNAPSHOT, null, 2),
        "model claude-haiku-5-5 · 2,400 input tokens · 150 output tokens · 1.50 s · cached",
      ]);
    });

    it("prints a clear error and exits 1 for an unknown contract", async () => {
      const { deps, out, err } = fakeDeps();

      const code = await run(argv("snapshot", "does-not-exist"), deps);

      expect(code).toBe(1);
      expect(out).toEqual([]);
      const generated = Array.from(
        { length: 20 },
        (_, i) => `nda-gen-${String(i + 1).padStart(2, "0")}`,
      );
      const samples = ["nda-sample-01", "nda-sample-02", "nda-sample-03", "nda-sample-04"];
      expect(err).toEqual([
        `error: Contract 'does-not-exist' not found. Known contracts: ${[...generated, ...samples].join(", ")}.`,
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
      expect(report).toContain(
        "Totals: 2 calls · live 2 · cached 0 · 4,800 input tokens · 300 output tokens",
      );
      expect(recordLine).toBe("\nRun record: reports/evals/snapshot-smoke-0.json");
    });

    it("replays a second run from the cache: zero live calls and an identical table", async () => {
      const llmCache = createMemoryCacheStore();
      const args = argv("eval", "snapshot", "--split", "smoke", "--runs", "2");
      const first = fakeDeps({ llmCache });
      await run(args, first.deps);
      const second = fakeDeps({ llmCache });

      expect(await run(args, second.deps)).toBe(0);

      expect(second.llm.calls).toEqual([]);
      expect(table(second.out[0])).toBe(table(first.out[0]));
      expect(second.out[0]).toContain("Totals: 2 calls · live 0 · cached 2 · 4,800 input tokens");
    });

    it("calls live and re-records with --live, before or after the command", async () => {
      const llmCache = createMemoryCacheStore();
      await run(argv("eval", "snapshot", "--split", "smoke"), fakeDeps({ llmCache }).deps);
      const after = fakeDeps({ llmCache });
      const before = fakeDeps({ llmCache });

      await run(argv("eval", "snapshot", "--split", "smoke", "--live"), after.deps);
      await run(argv("--live", "eval", "snapshot", "--split", "smoke"), before.deps);

      expect(after.llm.calls).toHaveLength(3);
      expect(before.llm.calls).toHaveLength(3);
      expect(after.out[0]).toContain("Totals: 3 calls · live 3 · cached 0");
    });

    it("replays offline with --replay-only, and stops with a clear error on a miss", async () => {
      const llmCache = createMemoryCacheStore();
      const args = argv("eval", "snapshot", "--split", "smoke", "--runs", "2", "--replay-only");
      await run(
        argv("eval", "snapshot", "--split", "smoke", "--runs", "1"),
        fakeDeps({ llmCache }).deps,
      );
      const { deps, llm, out, err, saved } = fakeDeps({ llmCache });

      const code = await run(args, deps);

      expect(code).toBe(1);
      expect(llm.calls).toEqual([]);
      expect(err.at(-1)).toMatch(
        /^error: No cached LLM call for model claude-haiku-5-5 · schema contract-snapshot · sample index 1 · /,
      );
      expect(out).toEqual([]);
      expect(saved).toEqual([]);
    });

    it("refuses --live together with --replay-only", async () => {
      const { deps, llm, err } = fakeDeps();

      const code = await run(argv("eval", "snapshot", "--live", "--replay-only"), deps);

      expect(code).toBe(1);
      expect(err.join("\n")).toMatch(
        /--live.*cannot be used with.*--replay-only|--replay-only.*cannot be used with.*--live/,
      );
      expect(llm.calls).toEqual([]);
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

  describe("eval --review-sheet", () => {
    it("builds the review sheet of the latest run record without calling the model", async () => {
      const { deps, llm, out, err, sheets } = fakeDeps({ answer });
      await run(argv("eval", "snapshot", "--split", "smoke", "--runs", "1"), deps);
      await run(argv("eval", "snapshot", "--runs", "2"), deps);
      await run(argv("eval", "snapshot", "--split", "smoke", "--runs", "1"), deps);
      llm.calls.length = 0;
      out.length = 0;
      err.length = 0;

      const code = await run(argv("eval", "snapshot", "--review-sheet", "--replay-only"), deps);

      expect(code).toBe(0);
      expect(llm.calls).toEqual([]);
      expect(err).toEqual(["Building the review sheet of reports/evals/snapshot-dev-1.json…"]);
      expect(out).toEqual([
        "Review sheet: reports/evals/snapshot-dev-1.review-sheet.md · 1 disagreement row · random sample of 5 of 5 agreeing rows",
      ]);
      const sheet = [...sheets.values()][0] ?? "";
      expect(sheet).toMatch(/^# Review sheet: eval snapshot · split dev · run of /);
      expect(sheet).toContain(
        "| nda-sample-01 | effectiveDate | 2025-03-03 | 2025-03-03 | ✗ last signature | [1.1] This Mutual Non-Disclosure Agreement",
      );
      expect(sheet).toContain(
        "| nda-sample-01 | parties | Kestrel Bioanalytics Limited (both); Marlow Data Systems Ltd (both) | ",
      );
      expect(sheet).toContain("(no sentence: field should be absent) |");
    });

    it("builds it from a chosen run record, on that record's split", async () => {
      const { deps, out, sheets } = fakeDeps();
      await run(argv("eval", "snapshot", "--split", "smoke", "--runs", "1"), deps);
      await run(argv("eval", "snapshot", "--runs", "1"), deps);
      out.length = 0;

      const code = await run(
        argv("eval", "snapshot", "--record", "reports/evals/snapshot-smoke-0.json"),
        deps,
      );

      expect(code).toBe(0);
      expect(out[0]).toMatch(
        /^Review sheet: reports\/evals\/snapshot-smoke-0\.review-sheet\.md · /,
      );
      expect([...sheets.values()][0]).toMatch(/^# Review sheet: eval snapshot · split smoke · /);
    });

    it("refuses a chosen record of another eval", async () => {
      const { deps, err, saved, sheets } = fakeDeps();
      await run(argv("eval", "snapshot", "--runs", "1"), deps);
      const record = saved[0] as RunRecord;
      record.eval = "triage";

      const code = await run(
        argv("eval", "snapshot", "--record", "reports/evals/snapshot-dev-0.json"),
        deps,
      );

      expect(code).toBe(1);
      expect(err.at(-1)).toBe(
        "error: Run record reports/evals/snapshot-dev-0.json is of eval 'triage', not 'snapshot'.",
      );
      expect(sheets.size).toBe(0);
    });

    it("says clearly when there is no run record to review", async () => {
      const { deps, err } = fakeDeps();

      const code = await run(argv("eval", "snapshot", "--review-sheet"), deps);

      expect(code).toBe(1);
      expect(err).toEqual([
        "error: Eval 'snapshot' has no run record for split dev yet; run the eval first.",
      ]);
    });
  });
});
