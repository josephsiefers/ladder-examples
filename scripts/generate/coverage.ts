import type { PlantSpec } from "./spec";

/** The UC1 metadata plants: the ways a snapshot value can be hard to read. */
export const PLANTS = [
  "effective date in numerals",
  "effective date in words",
  "effective date at last signature",
  "effective date not stated",
  "term in months",
  "term in years",
  "term until terminated on notice",
  "survival period that looks like the term",
  "survival indefinite for trade secrets",
  "survival indefinite",
  "one-way with a mutual recital",
  "governing law ≠ courts",
  "party and its Affiliates",
] as const;

export type Plant = (typeof PLANTS)[number];

/** Each plant must appear at least this often in each split. */
export const COVERAGE_MINIMUMS = { dev: 2, test: 1 } as const;

/** The plants one NDA carries. */
export function plantsOf(spec: PlantSpec): Plant[] {
  const { effectiveDate, term, survivalPeriod, mutuality } = spec;
  const plants: Plant[] = [];
  plants.push(
    effectiveDate.kind === "date"
      ? `effective date in ${effectiveDate.phrasing}`
      : effectiveDate.kind === "last-signature"
        ? "effective date at last signature"
        : "effective date not stated",
  );
  plants.push(term.kind === "fixed" ? `term in ${term.unit}` : "term until terminated on notice");
  if (survivalPeriod.kind === "indefinite") plants.push("survival indefinite");
  else if (survivalPeriod.phrasing === "like-term") {
    plants.push("survival period that looks like the term");
  } else if (survivalPeriod.phrasing === "trade-secrets-indefinite") {
    plants.push("survival indefinite for trade secrets");
  }
  if (mutuality.kind === "one-way" && mutuality.recital === "mutual-discussions") {
    plants.push("one-way with a mutual recital");
  }
  if (spec.governingLaw !== spec.courts) plants.push("governing law ≠ courts");
  if (spec.parties.some((party) => party.affiliates)) plants.push("party and its Affiliates");
  return plants;
}

export interface CoverageRow {
  plant: Plant;
  dev: number;
  test: number;
  met: boolean;
}

/** How many NDAs in each split carry each plant, in `PLANTS` order. */
export function coverage(specs: readonly PlantSpec[]): CoverageRow[] {
  const counted = specs.map((spec) => ({ split: spec.split, plants: plantsOf(spec) }));
  return PLANTS.map((plant) => {
    const count = (split: PlantSpec["split"]) =>
      counted.filter((nda) => nda.split === split && nda.plants.includes(plant)).length;
    const dev = count("dev");
    const test = count("test");
    return {
      plant,
      dev,
      test,
      met: dev >= COVERAGE_MINIMUMS.dev && test >= COVERAGE_MINIMUMS.test,
    };
  });
}

/** The coverage table as Markdown, with the minimums in the header. */
export function renderCoverageTable(rows: readonly CoverageRow[]): string {
  return [
    `| Plant | Dev (min ${COVERAGE_MINIMUMS.dev}) | Test (min ${COVERAGE_MINIMUMS.test}) | |`,
    "|---|---:|---:|---|",
    ...rows.map(
      ({ plant, dev, test, met }) => `| ${plant} | ${dev} | ${test} | ${met ? "ok" : "SHORT"} |`,
    ),
  ].join("\n");
}
