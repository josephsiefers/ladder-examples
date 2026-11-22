import { describe, expect, it } from "vitest";
import { caseRun, runRecord } from "./eval.fixtures";
import { renderReport } from "./report";
import type { FieldStats } from "./types";

const call = (inputTokens: number, outputTokens: number, cached = false) => ({
  model: "claude-haiku-5-5" as const,
  usage: { inputTokens, outputTokens },
  latencyMs: 1000,
  cached,
});

/** 2 cases × 3 runs. `term` fails on case y in runs 0 and 2; case x errors in run 1. Two calls are cached. */
const RECORD = runRecord(
  [
    caseRun("x", 0, { date: true, term: true }, { calls: [call(1000, 50)] }),
    caseRun(
      "y",
      0,
      { date: true, term: false },
      {
        expected: { date: "2025-03-03", term: "fixed 24 months" },
        actual: { date: "2025-03-03", term: "fixed 60 months" },
        calls: [call(2000, 60)],
      },
    ),
    caseRun(
      "x",
      1,
      { date: false, term: false },
      {
        expected: { date: "last signature", term: "until terminated | 30 days' notice" },
        actual: { date: "error: boom", term: "error: boom" },
        error: "boom\nstack",
      },
    ),
    caseRun("y", 1, { date: true, term: true }, { calls: [call(2000, 60, true)] }),
    caseRun("x", 2, { date: true, term: true }, { calls: [call(1000, 50, true)] }),
    caseRun(
      "y",
      2,
      { date: true, term: false },
      {
        expected: { date: "2025-03-03", term: "fixed 24 months" },
        actual: { date: "2025-03-03", term: "fixed 60 months" },
        calls: [call(2000, 60), call(500, 10)],
      },
    ),
  ],
  { eval: "toy", split: "smoke", wallTimeMs: 12_345 },
);

const target = (stats: readonly FieldStats[]) =>
  `${stats.map((stat) => stat.field).join(", ")} → target met`;

describe("renderReport", () => {
  it("renders the stats table, target line, failures and totals as Markdown", () => {
    expect(renderReport(RECORD, target)).toBe(
      [
        "## Eval toy · split smoke · 2 cases × 3 runs",
        "",
        "| Field | Mean | Stdev | Min | Max |",
        "|---|---:|---:|---:|---:|",
        "| date | 83.3% | 23.6% | 50.0% | 100.0% |",
        "| term | 50.0% | 0.0% | 50.0% | 50.0% |",
        "",
        "date, term → target met",
        "",
        "### Failures",
        "",
        "| Case | Field | Expected | Actual | Runs failed |",
        "|---|---|---|---|---:|",
        "| x | date | last signature | error: boom | 1/3 |",
        "| x | term | until terminated \\| 30 days' notice | error: boom | 1/3 |",
        "| y | term | fixed 24 months | fixed 60 months | 2/3 |",
        "",
        "Totals: 6 calls · live 4 · cached 2 · 8,500 input tokens · 290 output tokens · 1 failed case run · wall time 12.3 s",
      ].join("\n"),
    );
  });

  it("says so when nothing failed", () => {
    const record = runRecord([caseRun("x", 0, { date: true })], { wallTimeMs: 500 });

    const report = renderReport(record, () => "met");

    expect(report).toContain("### Failures\n\nNone.\n");
    expect(report).toContain("| date | 100.0% | 0.0% | 100.0% | 100.0% |");
    expect(report).toContain(
      "Totals: 0 calls · live 0 · cached 0 · 0 input tokens · 0 output tokens · 0 failed case runs · wall time 0.5 s",
    );
  });

  it("keeps a multi-line value on one table row", () => {
    const record = runRecord([
      caseRun("x", 0, { date: false }, { actual: { date: "first line  \n   second line" } }),
    ]);

    expect(renderReport(record, () => "")).toContain(
      "| x | date | gold | first line second line | 1/1 |",
    );
  });

  it("names a single case and a single run in the singular", () => {
    const record = runRecord([caseRun("x", 0, { date: false })]);

    expect(renderReport(record, () => "")).toMatch(/^## Eval toy · split smoke · 1 case × 1 run$/m);
  });
});
