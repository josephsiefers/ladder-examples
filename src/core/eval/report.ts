import { fieldStats } from "./stats";
import type { FieldStats, RunRecord } from "./types";

const count = new Intl.NumberFormat("en-GB");

/** An accuracy (0..1) as a percentage with one decimal, e.g. `96.3%`. */
export function formatPercent(accuracy: number): string {
  return `${(accuracy * 100).toFixed(1)}%`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A Markdown table cell: pipes escaped, line breaks flattened. */
const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll(/\s*\n\s*/g, " ");

const row = (cells: string[]) => `| ${cells.map(cell).join(" | ")} |`;

/**
 * The eval report in Markdown: per-field stats across runs, the definition's target line, the
 * failures list, and totals.
 */
export function renderReport(
  record: RunRecord,
  target: (stats: readonly FieldStats[]) => string,
): string {
  const stats = fieldStats(record);
  return [
    `## Eval ${record.eval} · split ${record.split} · ${plural(record.caseIds.length, "case")} × ${plural(record.runs, "run")}`,
    "",
    "| Field | Mean | Stdev | Min | Max |",
    "|---|---:|---:|---:|---:|",
    ...stats.map((stat) =>
      row([stat.field, ...[stat.mean, stat.stdev, stat.min, stat.max].map(formatPercent)]),
    ),
    "",
    target(stats),
    "",
    "### Failures",
    "",
    ...failuresTable(record),
    "",
    totalsLine(record),
  ].join("\n");
}

/** One row per (case, field, expected, actual), counting the runs it failed in. */
function failuresTable(record: RunRecord): string[] {
  const failures = new Map<string, { cells: string[]; runs: number }>();
  for (const caseId of record.caseIds) {
    for (const field of record.fields) {
      for (const result of record.results) {
        if (result.caseId !== caseId || result.correct[field]) continue;
        const cells = [caseId, field, result.expected[field] ?? "", result.actual[field] ?? ""];
        const key = JSON.stringify(cells);
        const failure = failures.get(key) ?? { cells, runs: 0 };
        failure.runs += 1;
        failures.set(key, failure);
      }
    }
  }
  if (failures.size === 0) return ["None."];
  return [
    "| Case | Field | Expected | Actual | Runs failed |",
    "|---|---|---|---|---:|",
    ...[...failures.values()].map(({ cells, runs }) => row([...cells, `${runs}/${record.runs}`])),
  ];
}

function totalsLine(record: RunRecord): string {
  const calls = record.results.flatMap((result) => result.calls);
  const tokens = (kind: "inputTokens" | "outputTokens") =>
    count.format(calls.reduce((sum, call) => sum + call.usage[kind], 0));
  const failed = record.results.filter((result) => result.error !== undefined).length;
  return [
    `Totals: ${plural(calls.length, "call")}`,
    `${tokens("inputTokens")} input tokens`,
    `${tokens("outputTokens")} output tokens`,
    `${plural(failed, "failed case run")}`,
    `wall time ${(record.wallTimeMs / 1000).toFixed(1)} s`,
  ].join(" · ");
}
