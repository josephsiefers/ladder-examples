import { describe, expect, it } from "vitest";
import { fillTemplate } from "./template";

describe("fillTemplate", () => {
  it("fills every placeholder, including one used twice", () => {
    expect(
      fillTemplate("{{a}} and {{b}}; again {{a}}.", { a: "Alpha Limited", b: "Beta Ltd" }, "t"),
    ).toBe("Alpha Limited and Beta Ltd; again Alpha Limited.");
  });

  it("leaves text without placeholders unchanged", () => {
    expect(fillTemplate("No placeholders here.", {}, "t")).toBe("No placeholders here.");
  });

  it("fails on a placeholder that has no value, naming it and the template", () => {
    expect(() => fillTemplate("For {{term.period}}.", { other: "x" }, "term/years")).toThrow(
      "Template 'term/years': unknown placeholder {{term.period}}.",
    );
  });

  it("fails on a malformed placeholder that would be left unfilled", () => {
    expect(() => fillTemplate("For {{term period}}.", {}, "term/years")).toThrow(
      "Template 'term/years': unfilled placeholder in 'For {{term period}}.'.",
    );
    expect(() => fillTemplate("For {term}}.", {}, "term/years")).toThrow("unfilled placeholder");
    expect(() => fillTemplate("For {{term}.", { term: "x" }, "term/years")).toThrow(
      "unfilled placeholder",
    );
  });

  it("does not re-read braces that a filled value brings in", () => {
    expect(fillTemplate("{{a}}", { a: "{{b}}" }, "t")).toBe("{{b}}");
  });
});
