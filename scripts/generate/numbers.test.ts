import { describe, expect, it } from "vitest";
import { cardinalWords, ordinalSuffix, ordinalWords, wordsWithNumerals } from "./numbers";

describe("number formats used by the clause-variant library", () => {
  it.each([
    [1, "one"],
    [2, "two"],
    [12, "twelve"],
    [15, "fifteen"],
    [20, "twenty"],
    [24, "twenty-four"],
    [30, "thirty"],
    [45, "forty-five"],
    [60, "sixty"],
    [90, "ninety"],
    [100, "one hundred"],
    [180, "one hundred and eighty"],
    [2000, "two thousand"],
    [2025, "two thousand and twenty-five"],
    [2026, "two thousand and twenty-six"],
  ])("writes %i in words as %s", (n, words) => {
    expect(cardinalWords(n)).toBe(words);
  });

  it("writes a count in words followed by numerals, e.g. a duration", () => {
    expect(wordsWithNumerals(2)).toBe("two (2)");
    expect(wordsWithNumerals(24)).toBe("twenty-four (24)");
  });

  it.each([
    [1, "first"],
    [2, "second"],
    [3, "third"],
    [5, "fifth"],
    [8, "eighth"],
    [9, "ninth"],
    [12, "twelfth"],
    [20, "twentieth"],
    [21, "twenty-first"],
    [30, "thirtieth"],
    [31, "thirty-first"],
  ])("writes day %i as the ordinal word %s", (n, words) => {
    expect(ordinalWords(n)).toBe(words);
  });

  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [31, "31st"],
  ])("writes day %i with its ordinal suffix as %s", (n, text) => {
    expect(ordinalSuffix(n)).toBe(text);
  });

  it.each([0, -1, 1.5, 10_000])("refuses %s, which no plant needs", (n) => {
    expect(() => cardinalWords(n)).toThrow(`Cannot write ${n} in words`);
  });
});
