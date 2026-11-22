import { describe, expect, it } from "vitest";
import { contractSnapshotSchema } from "./schema";
import { SAMPLE_SNAPSHOT as SNAPSHOT } from "./snapshot.fixtures";

describe("contract snapshot schema", () => {
  it.each([
    { field: "parties", value: [{ name: "Alpha Ltd", role: "discloser" }] },
    { field: "parties", value: [{ name: "Beta Inc", role: "recipient" }] },
    { field: "effectiveDate", value: { kind: "last-signature" } },
    { field: "effectiveDate", value: { kind: "not-stated" } },
    { field: "term", value: { kind: "until-terminated", noticeDays: 30 } },
    { field: "term", value: { kind: "not-stated" } },
    { field: "term", value: { kind: "until-terminated", noticeDays: 0 } },
    { field: "survivalPeriod", value: { kind: "indefinite" } },
    { field: "survivalPeriod", value: { kind: "not-stated" } },
    ...["new-york", "delaware", "california", "ontario", "singapore", "other", "not-stated"].map(
      (value) => ({ field: "governingLaw", value }),
    ),
    { field: "mutuality", value: "one-way" },
  ])("accepts $field = $value", ({ field, value }) => {
    const snapshot = { ...SNAPSHOT, [field]: value };

    expect(contractSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("accepts the sample NDA's snapshot", () => {
    expect(contractSnapshotSchema.parse(SNAPSHOT)).toEqual(SNAPSHOT);
  });

  it.each([
    { problem: "an unknown governing law", field: "governingLaw", value: "scotland" },
    { problem: "the courts in place of the law", field: "governingLaw", value: "england-courts" },
    { problem: "an unknown party role", field: "parties", value: [{ name: "A", role: "agent" }] },
    { problem: "no parties", field: "parties", value: [] },
    { problem: "an empty party name", field: "parties", value: [{ name: "", role: "both" }] },
    {
      problem: "a date not in YYYY-MM-DD",
      field: "effectiveDate",
      value: { kind: "date", value: "3 March 2025" },
    },
    {
      problem: "an impossible date",
      field: "effectiveDate",
      value: { kind: "date", value: "2025-02-30" },
    },
    { problem: "a fractional term", field: "term", value: { kind: "fixed", months: 1.5 } },
    { problem: "a zero term", field: "term", value: { kind: "fixed", months: 0 } },
    {
      problem: "a negative notice period",
      field: "term",
      value: { kind: "until-terminated", noticeDays: -1 },
    },
    {
      problem: "a survival kind from term",
      field: "survivalPeriod",
      value: { kind: "until-terminated", noticeDays: 30 },
    },
    { problem: "an unknown mutuality", field: "mutuality", value: "bilateral" },
    { problem: "a missing field", field: "mutuality", value: undefined },
  ])("rejects $problem", ({ field, value }) => {
    expect(contractSnapshotSchema.safeParse({ ...SNAPSHOT, [field]: value }).success).toBe(false);
  });
});
