import { DOC_TYPES, type DocType, type IntakePlantSpec } from "./spec";

/** The corpus needs at least this many hybrids, with some in each split. */
export const MIN_HYBRIDS = 6;

const SPLITS = ["dev", "test"] as const;

type Counts = { clean: number; hybrid: number };

export interface IntakeCoverageRow {
  docType: DocType;
  dev: Counts;
  test: Counts;
}

export interface IntakeCoverage {
  rows: IntakeCoverageRow[];
  /** Each minimum the specs fall short of; empty when coverage is met. */
  short: string[];
}

/** Per document type and split, how many clean and hybrid documents the specs build. */
export function intakeCoverage(specs: readonly IntakePlantSpec[]): IntakeCoverage {
  const count = (split: string, docType: DocType | undefined, ambiguity: string | undefined) =>
    specs.filter(
      (spec) =>
        spec.split === split &&
        (docType === undefined || spec.docType === docType) &&
        (ambiguity === undefined || spec.ambiguity === ambiguity),
    ).length;
  const counts = (split: string, docType: DocType): Counts => ({
    clean: count(split, docType, "clean"),
    hybrid: count(split, docType, "hybrid"),
  });
  const rows = DOC_TYPES.map((docType) => ({
    docType,
    dev: counts("dev", docType),
    test: counts("test", docType),
  }));
  const hybrids = specs.filter((spec) => spec.ambiguity === "hybrid").length;
  const short = [
    ...(hybrids < MIN_HYBRIDS ? [`fewer than ${MIN_HYBRIDS} hybrids (${hybrids})`] : []),
    ...SPLITS.filter((split) => count(split, undefined, "hybrid") === 0).map(
      (split) => `no hybrid in ${split}`,
    ),
    ...SPLITS.flatMap((split) =>
      DOC_TYPES.filter((docType) => count(split, docType, undefined) === 0).map(
        (docType) => `no ${docType} in ${split}`,
      ),
    ),
  ];
  return { rows, short };
}

const cells = ({ dev, test }: Pick<IntakeCoverageRow, "dev" | "test">) =>
  [dev.clean, dev.hybrid, test.clean, test.hybrid].join(" | ");

/** The coverage table as Markdown, with a totals row. */
export function renderIntakeCoverage({ rows }: IntakeCoverage): string {
  const total = (split: "dev" | "test", key: keyof Counts) =>
    rows.reduce((sum, row) => sum + row[split][key], 0);
  return [
    "| Type | Dev clean | Dev hybrid | Test clean | Test hybrid |",
    "|---|---:|---:|---:|---:|",
    ...rows.map((row) => `| ${row.docType} | ${cells(row)} |`),
    `| **total** | ${cells({
      dev: { clean: total("dev", "clean"), hybrid: total("dev", "hybrid") },
      test: { clean: total("test", "clean"), hybrid: total("test", "hybrid") },
    })} |`,
  ].join("\n");
}
