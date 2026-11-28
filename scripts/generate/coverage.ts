/** A split a generated corpus is written to. */
export type Split = "dev" | "test";

/** How often each plant must appear in each split. */
export interface CoverageMinimums {
  dev: number;
  test: number;
}

/** What a corpus must cover: its plants, the plants one spec carries, and the minimums. */
export interface CoveragePlan<Spec extends { split: Split }> {
  /** The coverage table's first column heading, e.g. "Plant". */
  label: string;
  plants: readonly string[];
  plantsOf(spec: Spec): readonly string[];
  minimums: CoverageMinimums;
}

export interface CoverageRow {
  plant: string;
  dev: number;
  test: number;
  met: boolean;
}

/** How many specs in each split carry each plant, in the plan's plant order. */
export function coverage<Spec extends { split: Split }>(
  specs: readonly Spec[],
  { plants, plantsOf, minimums }: CoveragePlan<Spec>,
): CoverageRow[] {
  const counted = specs.map((spec) => ({ split: spec.split, plants: plantsOf(spec) }));
  return plants.map((plant) => {
    const count = (split: Split) =>
      counted.filter((carried) => carried.split === split && carried.plants.includes(plant)).length;
    const dev = count("dev");
    const test = count("test");
    return { plant, dev, test, met: dev >= minimums.dev && test >= minimums.test };
  });
}

/** The coverage table as Markdown, under the plan's label, with its minimums in the header. */
export function renderCoverageTable(
  rows: readonly CoverageRow[],
  { minimums, label }: Pick<CoveragePlan<never>, "minimums" | "label">,
): string {
  return [
    `| ${label} | Dev (min ${minimums.dev}) | Test (min ${minimums.test}) | |`,
    "|---|---:|---:|---|",
    ...rows.map(
      ({ plant, dev, test, met }) => `| ${plant} | ${dev} | ${test} | ${met ? "ok" : "SHORT"} |`,
    ),
  ].join("\n");
}

/**
 * The error to print when some plant is short of its minimums, naming each one and the splits it
 * is short in; undefined when none is.
 */
export function shortfall(
  rows: readonly CoverageRow[],
  minimums: CoverageMinimums,
): string | undefined {
  const short = rows.filter(({ met }) => !met);
  if (short.length === 0) return undefined;
  const named = short.map((row) => {
    const splits = (["dev", "test"] as const).filter((split) => row[split] < minimums[split]);
    return `${row.plant} in ${splits.join(" and ")}`;
  });
  return `error: coverage minimums not met (${minimums.dev} in dev, ${minimums.test} in test) for ${short.length} plant(s): ${named.join(", ")}; add or change plant specs.`;
}
