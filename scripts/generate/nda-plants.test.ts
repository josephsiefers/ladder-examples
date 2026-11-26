import { describe, expect, it } from "vitest";
import { coverage, renderCoverageTable } from "./coverage";
import { MUTUAL_SPEC, WORKED_SPEC } from "./generate.fixtures";
import { NDA_COVERAGE, plantsOf } from "./nda-plants";
import type { PlantSpec } from "./spec";

describe("plantsOf", () => {
  it("names every plant an NDA carries", () => {
    expect(plantsOf(WORKED_SPEC)).toEqual([
      "effective date in words",
      "term in years",
      "survival period that looks like the term",
      "one-way with a mutual recital",
      "governing law ≠ courts",
      "party and its Affiliates",
    ]);
    expect(plantsOf(MUTUAL_SPEC)).toEqual([
      "effective date not stated",
      "term until terminated on notice",
      "survival indefinite",
    ]);
  });

  it.each([
    [
      { effectiveDate: { kind: "date", value: "2025-01-01", phrasing: "numerals" } },
      "effective date in numerals",
    ],
    [{ effectiveDate: { kind: "last-signature" } }, "effective date at last signature"],
    [{ term: { kind: "fixed", months: 18, unit: "months" } }, "term in months"],
    [
      {
        survivalPeriod: {
          kind: "fixed",
          months: 24,
          unit: "months",
          phrasing: "trade-secrets-indefinite",
        },
      },
      "survival indefinite for trade secrets",
    ],
  ] as [Partial<PlantSpec>, string][])("names %j as %s", (change, plant) => {
    expect(plantsOf({ ...MUTUAL_SPEC, ...change })).toContain(plant);
  });

  it("carries no extra plant for a plain fixed survival period or a plain one-way recital", () => {
    const spec: PlantSpec = {
      ...MUTUAL_SPEC,
      mutuality: { kind: "one-way", discloser: 1, recital: "plain" },
      survivalPeriod: { kind: "fixed", months: 24, unit: "months", phrasing: "fixed" },
    };
    expect(plantsOf(spec)).toEqual([
      "effective date not stated",
      "term until terminated on notice",
    ]);
  });
});

describe("NDA coverage", () => {
  it("counts each plant per split and marks it short below 2 in dev or 1 in test", () => {
    const rows = coverage([WORKED_SPEC, { ...WORKED_SPEC, id: "b" }, MUTUAL_SPEC], NDA_COVERAGE);
    expect(rows.find(({ plant }) => plant === "term in years")).toEqual({
      plant: "term in years",
      dev: 2,
      test: 0,
      met: false,
    });
    expect(rows.find(({ plant }) => plant === "survival indefinite")).toEqual({
      plant: "survival indefinite",
      dev: 0,
      test: 1,
      met: false,
    });
    const met = coverage(
      [WORKED_SPEC, WORKED_SPEC, { ...WORKED_SPEC, split: "test" }],
      NDA_COVERAGE,
    );
    expect(met.find(({ plant }) => plant === "term in years")?.met).toBe(true);
  });

  it("renders the table with the minimums in the header", () => {
    const table = renderCoverageTable(coverage([WORKED_SPEC], NDA_COVERAGE), NDA_COVERAGE.minimums);
    expect(table.split("\n").slice(0, 3)).toEqual([
      "| Plant | Dev (min 2) | Test (min 1) | |",
      "|---|---:|---:|---|",
      "| effective date in numerals | 0 | 0 | SHORT |",
    ]);
  });
});
