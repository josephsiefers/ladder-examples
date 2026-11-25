import { describe, expect, it } from "vitest";
import { createFirmDocuments } from "./firm";

/** A paragraph ID (see GLOSSARY.md) left at the start of a paragraph's text: `4.2 ` or `6. `. */
const UNPARSED_ID = /^(?:\d+(?:\.\d+)+|\d+\.)\s/;

describe("the firm's committed intake documents", () => {
  it("parse every paragraph ID they have", async () => {
    const firm = createFirmDocuments();
    const ids = await firm.listIntake();
    const unparsed: string[] = [];
    for (const id of ids) {
      for (const { text } of (await firm.readIntake(id)).paragraphs) {
        if (UNPARSED_ID.test(text)) unparsed.push(`${id}: ${text.slice(0, 40)}`);
      }
    }

    expect(ids.length).toBeGreaterThan(0);
    expect(unparsed).toEqual([]);
  });
});
