import { describe, expect, it } from "vitest";
import type { Contract } from "./contract";
import { renderContractForPrompt } from "./render";

const CONTRACT: Contract = {
  id: "nda-x",
  title: "Mutual Non-Disclosure Agreement",
  sections: [
    {
      number: 1,
      heading: "Parties and Background",
      paragraphs: [
        { id: "1.1", text: "Alpha Limited and Beta Limited." },
        { id: "1.2", text: "They wish to collaborate." },
      ],
    },
    { number: 2, heading: "Term", paragraphs: [{ id: "2.1", text: "Twenty-four months." }] },
  ],
};

describe("renderContractForPrompt", () => {
  it("marks every paragraph with its ID inside a contract tag", () => {
    expect(renderContractForPrompt(CONTRACT)).toBe(
      [
        '<contract id="nda-x">',
        "# Mutual Non-Disclosure Agreement",
        "",
        "## 1. Parties and Background",
        "[1.1] Alpha Limited and Beta Limited.",
        "[1.2] They wish to collaborate.",
        "",
        "## 2. Term",
        "[2.1] Twenty-four months.",
        "</contract>",
      ].join("\n"),
    );
  });
});
