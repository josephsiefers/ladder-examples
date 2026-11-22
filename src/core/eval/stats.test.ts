import { describe, expect, it } from "vitest";
import { caseRun, runRecord } from "./eval.fixtures";
import { fieldStats } from "./stats";

describe("fieldStats", () => {
  it("gives each field's accuracy per run, then mean, population stdev, min and max", () => {
    // Field a: run 0 → 2/4, run 1 → 3/4, run 2 → 4/4. Field b is always right.
    const pattern = [
      [true, true, false, false],
      [true, true, true, false],
      [true, true, true, true],
    ];
    const results = pattern.flatMap((cases, run) =>
      cases.map((a, index) => caseRun(`case-${index}`, run, { a, b: true })),
    );

    const [a, b] = fieldStats(runRecord(results));

    expect(a?.field).toBe("a");
    expect(a?.perRun).toEqual([0.5, 0.75, 1]);
    expect(a?.mean).toBeCloseTo(0.75, 10);
    // Population stdev of 0.5, 0.75, 1: sqrt(((-0.25)² + 0 + 0.25²) / 3) = 0.2041...
    expect(a?.stdev).toBeCloseTo(0.204124, 6);
    expect(a?.min).toBe(0.5);
    expect(a?.max).toBe(1);
    expect(b).toEqual({ field: "b", perRun: [1, 1, 1], mean: 1, stdev: 0, min: 1, max: 1 });
  });

  it("reports stdev 0 for a single run", () => {
    const results = [caseRun("x", 0, { a: true }), caseRun("y", 0, { a: false })];

    expect(fieldStats(runRecord(results))).toEqual([
      { field: "a", perRun: [0.5], mean: 0.5, stdev: 0, min: 0.5, max: 0.5 },
    ]);
  });

  it("reports 0 everywhere when every case fails", () => {
    const results = [0, 1].flatMap((run) => [
      caseRun("x", run, { a: false }, { error: "boom" }),
      caseRun("y", run, { a: false }, { error: "boom" }),
    ]);

    expect(fieldStats(runRecord(results))).toEqual([
      { field: "a", perRun: [0, 0], mean: 0, stdev: 0, min: 0, max: 0 },
    ]);
  });

  it("orders fields as the record lists them", () => {
    const results = [caseRun("x", 0, { a: true, b: false })];

    const stats = fieldStats(runRecord(results, { fields: ["b", "a"] }));

    expect(stats.map((stat) => stat.field)).toEqual(["b", "a"]);
  });
});
