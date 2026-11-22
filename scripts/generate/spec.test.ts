import { describe, expect, it } from "vitest";
import { MUTUAL_SPEC, WORKED_SPEC } from "./generate.fixtures";
import { type PlantSpec, plantSpecSchema } from "./spec";

function issues(spec: PlantSpec): string[] {
  const parsed = plantSpecSchema.safeParse(spec);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("plant spec validation", () => {
  it("accepts well-formed specs", () => {
    expect(issues(WORKED_SPEC)).toEqual([]);
    expect(issues(MUTUAL_SPEC)).toEqual([]);
  });

  it.each([
    {
      problem: "a term in years that is not whole years",
      spec: { ...WORKED_SPEC, term: { kind: "fixed", months: 18, unit: "years" } },
      issue: "term: a term in years must be a whole number of years",
    },
    {
      problem: "a survival period in years that is not whole years",
      spec: {
        ...WORKED_SPEC,
        survivalPeriod: { kind: "fixed", months: 30, unit: "years", phrasing: "fixed" },
      },
      issue: "survivalPeriod: a survival period in years must be a whole number of years",
    },
    {
      problem: "a like-term survival period with a term that runs until terminated",
      spec: { ...WORKED_SPEC, term: { kind: "until-terminated", noticeDays: 30 } },
      issue: "survivalPeriod: like-term needs a fixed term in the same unit",
    },
    {
      problem: "a like-term survival period in a different unit from the term",
      spec: { ...WORKED_SPEC, term: { kind: "fixed", months: 24, unit: "months" } },
      issue: "survivalPeriod: like-term needs a fixed term in the same unit",
    },
  ] as { problem: string; spec: PlantSpec; issue: string }[])(
    "rejects $problem",
    ({ spec, issue }) => {
      expect(issues(spec)).toEqual([issue]);
    },
  );

  it("accepts whole years and fixed survival wordings with any term", () => {
    const spec: PlantSpec = {
      ...MUTUAL_SPEC,
      term: { kind: "fixed", months: 36, unit: "years" },
      survivalPeriod: {
        kind: "fixed",
        months: 24,
        unit: "years",
        phrasing: "trade-secrets-indefinite",
      },
    };
    expect(issues(spec)).toEqual([]);
    expect(issues({ ...spec, term: { kind: "until-terminated", noticeDays: 30 } })).toEqual([]);
  });
});
