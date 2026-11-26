/** A split a generated corpus is written to. */
export type Split = "dev" | "test";

/** How often each plant must appear in each split. */
export interface CoverageMinimums {
  dev: number;
  test: number;
}

/** What a corpus must cover: its plants, the plants one spec carries, and the minimums. */
export interface CoveragePlan<Spec extends { split: Split }> {
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

/** The coverage table as Markdown, with the minimums in the header. */
export function renderCoverageTable(
  rows: readonly CoverageRow[],
  minimums: CoverageMinimums,
): string {
  return [
    `| Plant | Dev (min ${minimums.dev}) | Test (min ${minimums.test}) | |`,
    "|---|---:|---:|---|",
    ...rows.map(
      ({ plant, dev, test, met }) => `| ${plant} | ${dev} | ${test} | ${met ? "ok" : "SHORT"} |`,
    ),
  ].join("\n");
}

/** The error to print when some plant is short of its minimums; undefined when none is. */
export function shortfall(
  rows: readonly CoverageRow[],
  minimums: CoverageMinimums,
): string | undefined {
  const short = rows.filter(({ met }) => !met).length;
  if (short === 0) return undefined;
  return `error: coverage minimums not met (${minimums.dev} in dev, ${minimums.test} in test) for ${short} plant(s); add or change plant specs.`;
}
