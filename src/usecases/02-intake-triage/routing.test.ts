import { describe, expect, it } from "vitest";
import { ROUTING_TABLE } from "./routing";
import { DOC_TYPES } from "./schema";

describe("routing table", () => {
  it("maps every document type to exactly the UC2 spec's queue", () => {
    expect(ROUTING_TABLE).toEqual({
      nda: "nda-review",
      msa: "commercial",
      sow: "commercial",
      dpa: "privacy",
      other: "senior-associate",
    });
  });

  it("covers the whole document type union and nothing else", () => {
    expect(Object.keys(ROUTING_TABLE).toSorted()).toEqual([...DOC_TYPES].toSorted());
  });
});
