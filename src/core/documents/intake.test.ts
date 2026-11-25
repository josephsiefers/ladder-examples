import { describe, expect, it } from "vitest";
import { renderIntakeForPrompt } from "./intake";

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
