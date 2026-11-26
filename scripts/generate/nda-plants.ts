import type { CoveragePlan } from "./coverage";
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

/** What the NDA corpus must cover. */
export const NDA_COVERAGE: CoveragePlan<PlantSpec> = {
  plants: PLANTS,
  plantsOf,
  minimums: COVERAGE_MINIMUMS,
};
