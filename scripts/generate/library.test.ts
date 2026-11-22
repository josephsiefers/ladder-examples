import { describe, expect, it } from "vitest";
import { jurisdictionsNamed, TIME_WORDS } from "./corpus.fixtures";
import { CLAUSE_TYPES, loadLibrary, STANDARD_VARIANT } from "./library";

const library = await loadLibrary();

const standardBodies = CLAUSE_TYPES.flatMap((type) =>
  Object.entries(library.clauses[type])
    .filter(([name]) => STANDARD_VARIANT.test(name))
    .flatMap(([name, { paragraphs }]) =>
      paragraphs.map((text) => ({ label: `${type}/${name}`, text })),
    ),
);

describe("the clause-variant library", () => {
  it("has 2–3 standard wordings for every clause type", () => {
    const outOfRange = CLAUSE_TYPES.filter((type) => {
      const count = Object.keys(library.clauses[type]).filter((n) =>
        STANDARD_VARIANT.test(n),
      ).length;
      return count < 2 || count > 3;
    });
    expect(outOfRange).toEqual([]);
  });

  // The collision rule: planted values come only from metadata phrasings.
  it.each(standardBodies)("keeps planted values out of $label", ({ text }) => {
    expect(text).not.toMatch(/[{}]/);
    expect(jurisdictionsNamed(text)).toEqual([]);
    expect(text).not.toMatch(TIME_WORDS);
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/\b(mutual|each party|both parties|effective date)\b/i);
  });
});
