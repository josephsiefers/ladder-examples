import { describe, expect, it } from "vitest";
import { intakeCoverage, renderIntakeCoverage } from "./coverage";
import { CLEAN_MSA } from "./intake.fixtures";
import type { IntakePlantSpec } from "./spec";

const spec = (
  split: IntakePlantSpec["split"],
  docType: IntakePlantSpec["docType"],
  hybrid = false,
): IntakePlantSpec => ({
  ...CLEAN_MSA,
  split,
  docType,
  ambiguity: hybrid ? "hybrid" : "clean",
  ingredients: hybrid ? ["x"] : [],
});

const everyTypeBothSplits = (["dev", "test"] as const).flatMap((split) =>
  (["nda", "msa", "dpa", "sow", "other"] as const).map((docType) => spec(split, docType)),
);

describe("intakeCoverage", () => {
  it("counts each type's clean and hybrid documents per split", () => {
    const { rows } = intakeCoverage([
      spec("dev", "msa"),
      spec("dev", "msa", true),
      spec("test", "msa", true),
      spec("dev", "nda"),
    ]);
    expect(rows.find((row) => row.docType === "msa")).toEqual({
      docType: "msa",
      dev: { clean: 1, hybrid: 1 },
      test: { clean: 0, hybrid: 1 },
    });
    expect(rows.map((row) => row.docType)).toEqual(["nda", "msa", "dpa", "sow", "other"]);
  });

  it("is met with at least 6 hybrids, hybrids in both splits and every type in both", () => {
    const hybrids = [1, 2, 3, 4, 5].map(() => spec("dev", "msa", true));
    expect(
      intakeCoverage([...everyTypeBothSplits, ...hybrids, spec("test", "sow", true)]).short,
    ).toEqual([]);
    expect(intakeCoverage([...everyTypeBothSplits, ...hybrids]).short).toEqual([
      "fewer than 6 hybrids (5)",
      "no hybrid in test",
    ]);
    expect(
      intakeCoverage([...everyTypeBothSplits.slice(1), ...hybrids, spec("test", "sow", true)])
        .short,
    ).toEqual(["no nda in dev"]);
  });

  it("renders a table with totals", () => {
    const table = renderIntakeCoverage(
      intakeCoverage([spec("dev", "msa"), spec("test", "msa", true)]),
    );
    expect(table.split("\n")).toEqual([
      "| Type | Dev clean | Dev hybrid | Test clean | Test hybrid |",
      "|---|---:|---:|---:|---:|",
      "| nda | 0 | 0 | 0 | 0 |",
      "| msa | 1 | 0 | 0 | 1 |",
      "| dpa | 0 | 0 | 0 | 0 |",
      "| sow | 0 | 0 | 0 | 0 |",
      "| other | 0 | 0 | 0 | 0 |",
      "| **total** | 1 | 0 | 0 | 1 |",
    ]);
  });
});
