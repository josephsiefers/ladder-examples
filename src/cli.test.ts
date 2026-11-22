import { describe, expect, it } from "vitest";
import { buildProgram, type CliDeps, run } from "./cli";
import { createFirmDocuments } from "./core/documents";
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

function fakeDeps() {
  const out: string[] = [];
  const err: string[] = [];
  const llm = createFakeLlm(() => SNAPSHOT, {
    usage: { inputTokens: 2400, outputTokens: 150 },
    latencyMs: 1500,
  });
  const deps: CliDeps = {
    llm,
    documents: createFirmDocuments(),
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  };
  return { deps, llm, out, err };
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
        "error: Contract 'does-not-exist' not found. Known contracts: nda-sample-01.",
      ]);
    });
  });
});
