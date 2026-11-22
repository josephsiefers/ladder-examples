import type { FieldStats, RunRecord } from "./types";

/** Each field's accuracy in every run, then the mean, population stdev, min and max across runs. */
export function fieldStats(record: RunRecord): FieldStats[] {
  const runs = Array.from({ length: record.runs }, (_, run) =>
    record.results.filter((result) => result.run === run),
  );
  return record.fields.map((field) => {
    const perRun = runs.map(
      (results) => results.filter((result) => result.correct[field]).length / results.length,
    );
    const mean = perRun.reduce((sum, value) => sum + value, 0) / perRun.length;
    const variance = perRun.reduce((sum, value) => sum + (value - mean) ** 2, 0) / perRun.length;
    return {
      field,
      perRun,
      mean,
      stdev: Math.sqrt(variance),
      min: Math.min(...perRun),
      max: Math.max(...perRun),
    };
  });
}
