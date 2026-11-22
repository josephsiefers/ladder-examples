import { describe, expect, it } from "vitest";
import type { ContractSnapshot } from "./schema";
import { describeSnapshot, normalise, scoreSnapshot } from "./score";
import { SAMPLE_SNAPSHOT as GOLD } from "./snapshot.fixtures";

const allCorrect = {
  parties: true,
  effectiveDate: true,
  term: true,
  survivalPeriod: true,
  governingLaw: true,
  mutuality: true,
};

describe("normalise", () => {
  it.each([
    ["Marlow Data Systems Ltd", "marlow data systems ltd"],
    ["  Marlow   Data\n Systems  Ltd ", "marlow data systems ltd"],
    ["Halden Robotics Pte. Ltd.", "halden robotics pte. ltd"],
    ["Acme, Inc.;", "acme, inc"],
    ["Acme Inc .", "acme inc"],
    ["Acme!?", "acme"],
  ])("normalises %j to %j", (raw, expected) => {
    expect(normalise(raw)).toBe(expected);
  });
});

describe("scoreSnapshot", () => {
  it("scores every field correct for an identical snapshot", () => {
    expect(scoreSnapshot(GOLD, GOLD)).toEqual(allCorrect);
  });

  it("compares parties as a set, ignoring order, case, whitespace and trailing punctuation", () => {
    const output: ContractSnapshot = {
      ...GOLD,
      parties: [
        { name: "  MARLOW data   systems Ltd.", role: "both" },
        { name: "kestrel bioanalytics limited", role: "both" },
      ],
    };

    expect(scoreSnapshot(output, GOLD).parties).toBe(true);
  });

  it.each([
    {
      problem: "a wrong role",
      parties: [
        { name: "Kestrel Bioanalytics Limited", role: "discloser" },
        { name: "Marlow Data Systems Ltd", role: "both" },
      ],
    },
    {
      problem: "a missing party",
      parties: [{ name: "Kestrel Bioanalytics Limited", role: "both" }],
    },
    {
      problem: "an extra party",
      parties: [...GOLD.parties, { name: "Kestrel Group plc", role: "both" }],
    },
    {
      problem: "a party listed twice, differing only in case and punctuation",
      parties: [...GOLD.parties, { name: "kestrel bioanalytics limited.", role: "both" }],
    },
    {
      problem: "a name with 'and its Affiliates' left in",
      parties: [
        { name: "Kestrel Bioanalytics Limited and its Affiliates", role: "both" },
        { name: "Marlow Data Systems Ltd", role: "both" },
      ],
    },
  ] as const)("scores parties false for $problem", ({ parties }) => {
    const output = { ...GOLD, parties: [...parties] };

    expect(scoreSnapshot(output, GOLD)).toEqual({ ...allCorrect, parties: false });
  });

  it.each([
    { field: "effectiveDate", value: { kind: "date", value: "2025-03-04" } },
    { field: "effectiveDate", value: { kind: "last-signature" } },
    { field: "term", value: { kind: "fixed", months: 60 } },
    { field: "term", value: { kind: "until-terminated", noticeDays: 30 } },
    { field: "survivalPeriod", value: { kind: "fixed", months: 24 } },
    { field: "survivalPeriod", value: { kind: "indefinite" } },
    { field: "governingLaw", value: "delaware" },
    { field: "mutuality", value: "one-way" },
  ])("scores only $field false for $value", ({ field, value }) => {
    const output = { ...GOLD, [field]: value } as ContractSnapshot;

    expect(scoreSnapshot(output, GOLD)).toEqual({ ...allCorrect, [field]: false });
  });

  it("scores false when the notice period differs", () => {
    const gold: ContractSnapshot = { ...GOLD, term: { kind: "until-terminated", noticeDays: 30 } };
    const output: ContractSnapshot = {
      ...GOLD,
      term: { kind: "until-terminated", noticeDays: 90 },
    };

    expect(scoreSnapshot(output, gold).term).toBe(false);
  });

  it("scores an invented value false where gold is not stated", () => {
    const gold: ContractSnapshot = {
      ...GOLD,
      effectiveDate: { kind: "not-stated" },
      term: { kind: "not-stated" },
      survivalPeriod: { kind: "not-stated" },
      governingLaw: "not-stated",
    };

    expect(scoreSnapshot(GOLD, gold)).toEqual({
      ...allCorrect,
      effectiveDate: false,
      term: false,
      survivalPeriod: false,
      governingLaw: false,
    });
    expect(scoreSnapshot(gold, gold)).toEqual(allCorrect);
  });
});

describe("describeSnapshot", () => {
  it("describes each field as one readable line", () => {
    expect(describeSnapshot(GOLD)).toEqual({
      parties: "Kestrel Bioanalytics Limited (both); Marlow Data Systems Ltd (both)",
      effectiveDate: "2025-03-03",
      term: "fixed 24 months",
      survivalPeriod: "fixed 60 months",
      governingLaw: "england-and-wales",
      mutuality: "mutual",
    });
  });

  it("describes the other kinds of each field", () => {
    const snapshot: ContractSnapshot = {
      parties: [
        { name: "Zeta LLC", role: "recipient" },
        { name: "Alpha Inc.", role: "discloser" },
      ],
      effectiveDate: { kind: "last-signature" },
      term: { kind: "until-terminated", noticeDays: 30 },
      survivalPeriod: { kind: "indefinite" },
      governingLaw: "not-stated",
      mutuality: "one-way",
    };

    expect(describeSnapshot(snapshot)).toEqual({
      parties: "Alpha Inc. (discloser); Zeta LLC (recipient)",
      effectiveDate: "last signature",
      term: "until terminated on 30 days' notice",
      survivalPeriod: "indefinite",
      governingLaw: "not-stated",
      mutuality: "one-way",
    });
    expect(
      describeSnapshot({
        ...snapshot,
        effectiveDate: { kind: "not-stated" },
        term: { kind: "not-stated" },
        survivalPeriod: { kind: "not-stated" },
      }),
    ).toMatchObject({
      effectiveDate: "not stated",
      term: "not stated",
      survivalPeriod: "not stated",
    });
  });
});
