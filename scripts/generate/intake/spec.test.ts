import { describe, expect, it } from "vitest";
import { MSA_SPEC } from "./intake.fixtures";
import { intakePlantSpecSchema } from "./spec";

describe("intakePlantSpecSchema", () => {
  it("accepts a clean document with no ingredients", () => {
    expect(intakePlantSpecSchema.parse(MSA_SPEC)).toEqual(MSA_SPEC);
  });

  it("refuses a clean document with ingredients, and a hybrid without", () => {
    const message = "a hybrid document needs ingredients, and a clean one has none";
    const clean = intakePlantSpecSchema.safeParse({ ...MSA_SPEC, ingredients: ["x"] });
    const hybrid = intakePlantSpecSchema.safeParse({ ...MSA_SPEC, ambiguity: "hybrid" });
    expect(clean.error?.issues.map((issue) => issue.message)).toEqual([message]);
    expect(hybrid.error?.issues.map((issue) => issue.message)).toEqual([message]);
    expect(
      intakePlantSpecSchema.safeParse({ ...MSA_SPEC, ambiguity: "hybrid", ingredients: ["x"] })
        .success,
    ).toBe(true);
  });
});
