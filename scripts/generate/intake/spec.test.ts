import { describe, expect, it } from "vitest";
import { MSA_SPEC } from "./intake.fixtures";
import { intakePlantSpecSchema } from "./spec";

describe("intakePlantSpecSchema", () => {
  it("accepts a clean document with no ingredients", () => {
    expect(intakePlantSpecSchema.parse(MSA_SPEC)).toEqual(MSA_SPEC);
  });

  it("refuses an ID that is not lowercase letters, digits and hyphens throughout", () => {
    for (const id of ["Intake-x1", "intake-x1!", "intake x1"]) {
      expect({ id, ok: intakePlantSpecSchema.safeParse({ ...MSA_SPEC, id }).success }).toEqual({
        id,
        ok: false,
      });
    }
  });

  it("refuses an empty ingredient name", () => {
    const spec = { ...MSA_SPEC, ambiguity: "hybrid", ingredients: [""] };
    expect(intakePlantSpecSchema.safeParse(spec).error?.issues[0]?.path).toEqual([
      "ingredients",
      0,
    ]);
  });

  it("refuses a clean document with ingredients, and a hybrid without", () => {
    const message = "a hybrid document needs ingredients, and a clean one has none";
    const clean = intakePlantSpecSchema.safeParse({ ...MSA_SPEC, ingredients: ["x"] });
    const hybrid = intakePlantSpecSchema.safeParse({ ...MSA_SPEC, ambiguity: "hybrid" });
    expect(
      clean.error?.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    ).toEqual([{ path: ["ingredients"], message }]);
    expect(hybrid.error?.issues.map((issue) => issue.message)).toEqual([message]);
    expect(
      intakePlantSpecSchema.safeParse({ ...MSA_SPEC, ambiguity: "hybrid", ingredients: ["x"] })
        .success,
    ).toBe(true);
  });
});
