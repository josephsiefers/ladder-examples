import { describe, expect, it } from "vitest";
import { plural, row, tableHead } from "./markdown";

describe("row", () => {
  it("escapes pipes and flattens line breaks in each cell", () => {
    expect(row(["a|b", "one\n  two"])).toBe("| a\\|b | one two |");
  });
});

describe("plural", () => {
  it("pluralises a count's noun unless it is one", () => {
    expect([0, 1, 2].map((n) => plural(n, "case run"))).toEqual([
      "0 case runs",
      "1 case run",
      "2 case runs",
    ]);
  });
});

describe("tableHead", () => {
  it("gives the header row and a separator: first column left-aligned, the rest right", () => {
    expect(tableHead(["Type", "Precision", "Recall"])).toEqual([
      "| Type | Precision | Recall |",
      "|---|---:|---:|",
    ]);
  });
});
