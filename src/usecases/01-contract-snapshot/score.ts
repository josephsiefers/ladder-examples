import type { ContractSnapshot } from "./schema";

/** The snapshot's fields, in report order. */
export const SNAPSHOT_FIELDS = [
  "parties",
  "effectiveDate",
  "term",
  "survivalPeriod",
  "governingLaw",
  "mutuality",
] as const;

export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

/** The UC1 scoring normalisation: case-folded, whitespace collapsed, trailing punctuation stripped. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/[\s.,;:!?]+$/, "");
}

/** Each field as one readable line; non-party fields are scored on this line. */
export function describeSnapshot(snapshot: ContractSnapshot): Record<SnapshotField, string> {
  const { effectiveDate, term, survivalPeriod } = snapshot;
  const notStated = "not stated";
  return {
    parties: snapshot.parties
      .map((party) => `${party.name} (${party.role})`)
      .toSorted()
      .join("; "),
    effectiveDate:
      effectiveDate.kind === "date"
        ? effectiveDate.value
        : effectiveDate.kind === "last-signature"
          ? "last signature"
          : notStated,
    term:
      term.kind === "fixed"
        ? `fixed ${term.months} months`
        : term.kind === "until-terminated"
          ? `until terminated on ${term.noticeDays} days' notice`
          : notStated,
    survivalPeriod:
      survivalPeriod.kind === "fixed"
        ? `fixed ${survivalPeriod.months} months`
        : survivalPeriod.kind === "indefinite"
          ? "indefinite"
          : notStated,
    governingLaw: snapshot.governingLaw,
    mutuality: snapshot.mutuality,
  };
}

/** A snapshot's parties as sorted, normalised `(name, role)` pairs; a repeated party counts twice. */
function partyKey(snapshot: ContractSnapshot): string {
  return JSON.stringify(
    snapshot.parties.map((party) => `${normalise(party.name)}\n${party.role}`).toSorted(),
  );
}

/**
 * UC1 scoring: each field exact-match after normalisation; parties as an order-insensitive set
 * of `(name, role)`, where listing one party twice is an extra party. "Not stated" is a value like any other, so an invented value scores false.
 */
export function scoreSnapshot(
  output: ContractSnapshot,
  gold: ContractSnapshot,
): Record<SnapshotField, boolean> {
  const actual = describeSnapshot(output);
  const expected = describeSnapshot(gold);
  const sameLine = (field: Exclude<SnapshotField, "parties">) =>
    normalise(actual[field]) === normalise(expected[field]);
  return {
    parties: partyKey(output) === partyKey(gold),
    effectiveDate: sameLine("effectiveDate"),
    term: sameLine("term"),
    survivalPeriod: sameLine("survivalPeriod"),
    governingLaw: sameLine("governingLaw"),
    mutuality: sameLine("mutuality"),
  };
}
