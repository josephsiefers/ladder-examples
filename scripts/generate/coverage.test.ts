import { describe, expect, it } from "vitest";
import { type CoveragePlan, coverage, renderCoverageTable, shortfall } from "./coverage";

interface ToySpec {
  split: "dev" | "test";
  plants: string[];
}

const PLAN: CoveragePlan<ToySpec> = {
  label: "Toy plant",
  plants: ["a", "b"],
  plantsOf: (spec) => spec.plants,
  minimums: { dev: 2, test: 1 },
};

const SPECS: ToySpec[] = [
  { split: "dev", plants: ["a"] },
  { split: "dev", plants: ["a", "b"] },
  { split: "test", plants: ["a"] },
  { split: "test", plants: ["b"] },
];

describe("coverage", () => {
  it("counts each plant per split, in plan order, and marks it met at the minimums", () => {
    expect(coverage(SPECS, PLAN)).toEqual([
      { plant: "a", dev: 2, test: 1, met: true },
      { plant: "b", dev: 1, test: 1, met: false },
    ]);
  });

  it("marks a plant short when only the test split falls below its minimum", () => {
    expect(coverage(SPECS.slice(0, 2), PLAN)[0]).toEqual({
      plant: "a",
      dev: 2,
      test: 0,
      met: false,
    });
  });

  it("renders the table under the plan's label, with the minimums in the header", () => {
    expect(renderCoverageTable(coverage(SPECS, PLAN), PLAN)).toBe(
      [
        "| Toy plant | Dev (min 2) | Test (min 1) | |",
        "|---|---:|---:|---|",
        "| a | 2 | 1 | ok |",
        "| b | 1 | 1 | SHORT |",
      ].join("\n"),
    );
  });

  it("explains a shortfall, naming each short plant and split, and finds none when every minimum is met", () => {
    expect(shortfall(coverage(SPECS, PLAN), PLAN.minimums)).toBe(
      "error: coverage minimums not met (2 in dev, 1 in test) for 1 plant(s): b in dev; add or change plant specs.",
    );
    expect(shortfall(coverage(SPECS.slice(1, 2), PLAN), PLAN.minimums)).toBe(
      "error: coverage minimums not met (2 in dev, 1 in test) for 2 plant(s): a in dev and test, b in dev and test; add or change plant specs.",
    );
    expect(shortfall(coverage(SPECS.slice(0, 2), PLAN), PLAN.minimums)).toBe(
      "error: coverage minimums not met (2 in dev, 1 in test) for 2 plant(s): a in test, b in dev and test; add or change plant specs.",
    );
    expect(shortfall(coverage(SPECS, PLAN).slice(0, 1), PLAN.minimums)).toBeUndefined();
  });
});
