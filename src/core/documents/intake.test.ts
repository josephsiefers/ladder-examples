import { describe, expect, it } from "vitest";
import { AMBIGUITIES, DOC_TYPES, renderIntakeForPrompt, TITLE_EVIDENCE } from "./intake";

describe("renderIntakeForPrompt", () => {
  it("wraps the document in a tagged block, marking numbered paragraphs only", () => {
    const rendered = renderIntakeForPrompt({
      id: "intake-a",
      title: "Master Services Agreement",
      paragraphs: [{ text: "## 5. Confidentiality" }, { id: "5.1", text: "Each party shall." }],
    });

    expect(rendered).toBe(
      [
        '<intake-document id="intake-a">',
        "# Master Services Agreement",
        "",
        "## 5. Confidentiality",
        "",
        "[5.1] Each party shall.",
        "</intake-document>",
      ].join("\n"),
    );
  });
});

describe("the UC2 vocabulary", () => {
  it("names the five document types, the two ambiguities and the title evidence marker", () => {
    expect(DOC_TYPES).toEqual(["nda", "msa", "dpa", "sow", "other"]);
    expect(AMBIGUITIES).toEqual(["clean", "hybrid"]);
    expect(TITLE_EVIDENCE).toBe("title");
  });
});
