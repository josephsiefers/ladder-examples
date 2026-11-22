import type { CaseRun, RunRecord } from "./types";

/** A (case, run) result where each field is right or wrong as given; values are placeholders. */
export function caseRun(
  caseId: string,
  run: number,
  correct: Record<string, boolean>,
  overrides: Partial<CaseRun> = {},
): CaseRun {
  const fields = Object.keys(correct);
  return {
    caseId,
    run,
    correct,
    expected: Object.fromEntries(fields.map((field) => [field, "gold"])),
    actual: Object.fromEntries(
      fields.map((field) => [field, correct[field] ? "gold" : "something else"]),
    ),
    calls: [],
    ...overrides,
  };
}

/** A run record holding `results`, with its fields, cases and run count inferred from them. */
export function runRecord(results: CaseRun[], overrides: Partial<RunRecord> = {}): RunRecord {
  const fields = Object.keys(results[0]?.correct ?? {});
  return {
    eval: "toy",
    split: "smoke",
    runs: new Set(results.map((result) => result.run)).size,
    concurrency: 4,
    startedAt: "2026-11-22T09:00:00.000Z",
    wallTimeMs: 0,
    fields,
    caseIds: [...new Set(results.map((result) => result.caseId))],
    results,
    ...overrides,
  };
}
