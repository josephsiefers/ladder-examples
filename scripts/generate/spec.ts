import { z } from "zod";

/** The jurisdictions a plant spec may choose, for governing law and for courts. */
export const JURISDICTIONS = {
  "england-and-wales": {
    law: "the laws of England and Wales",
    courts: "the courts of England and Wales",
  },
  "new-york": {
    law: "the laws of the State of New York",
    courts: "the state and federal courts located in the State of New York",
  },
  delaware: {
    law: "the laws of the State of Delaware",
    courts: "the state and federal courts located in the State of Delaware",
  },
  california: {
    law: "the laws of the State of California",
    courts: "the state and federal courts located in the State of California",
  },
  ontario: {
    law: "the laws of the Province of Ontario",
    courts: "the courts of the Province of Ontario",
  },
  singapore: {
    law: "the laws of the Republic of Singapore",
    courts: "the courts of the Republic of Singapore",
  },
} as const;

export type Jurisdiction = keyof typeof JURISDICTIONS;

const jurisdiction = z.enum(Object.keys(JURISDICTIONS) as [Jurisdiction, ...Jurisdiction[]]);
const months = z.number().int().positive();
const unit = z.enum(["months", "years"]);

const party = z.object({
  /** The legal entity, as gold records it. */
  name: z.string().min(1),
  /** The defined short name, e.g. "Kestrel". */
  short: z.string().min(1),
  /** Named in the contract as "<name> and its Affiliates". */
  affiliates: z.boolean().optional(),
});

/**
 * One generated NDA: its split and seed, its parties, the metadata values to plant, and which
 * phrasings express them. Gold is computed from this, so it is correct by construction.
 */
export const plantSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    split: z.enum(["dev", "test"]),
    /** Seeds the choice of clause variants, wordings and clause order. */
    seed: z.number().int().nonnegative(),
    parties: z.tuple([party, party]),
    /** What the parties are discussing, completing "for … (the \"Purpose\")". */
    purpose: z.string().min(1),
    mutuality: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("mutual") }),
      z.object({
        kind: z.literal("one-way"),
        /** Index into `parties` of the party that discloses. */
        discloser: z.union([z.literal(0), z.literal(1)]),
        recital: z.enum(["plain", "mutual-discussions"]),
      }),
    ]),
    effectiveDate: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("date"),
        value: z.iso.date(),
        phrasing: z.enum(["numerals", "words"]),
      }),
      z.object({ kind: z.literal("last-signature") }),
      z.object({ kind: z.literal("not-stated") }),
    ]),
    term: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("fixed"), months, unit }),
      z.object({ kind: z.literal("until-terminated"), noticeDays: z.number().int().positive() }),
    ]),
    survivalPeriod: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("fixed"),
        months,
        unit,
        /** `like-term` words it like the term; `trade-secrets-indefinite` adds an indefinite period for trade secrets. */
        phrasing: z.enum(["fixed", "like-term", "trade-secrets-indefinite"]),
      }),
      z.object({ kind: z.literal("indefinite") }),
    ]),
    governingLaw: jurisdiction,
    courts: jurisdiction,
  })
  .superRefine((spec, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    const { term, survivalPeriod } = spec;
    if (term.kind === "fixed" && term.unit === "years" && term.months % 12 !== 0) {
      issue("term", "a term in years must be a whole number of years");
    }
    if (survivalPeriod.kind !== "fixed") return;
    if (survivalPeriod.unit === "years" && survivalPeriod.months % 12 !== 0) {
      issue("survivalPeriod", "a survival period in years must be a whole number of years");
    }
    if (
      survivalPeriod.phrasing === "like-term" &&
      (term.kind !== "fixed" || term.unit !== survivalPeriod.unit)
    ) {
      issue("survivalPeriod", "like-term needs a fixed term in the same unit");
    }
  });

export type PlantSpec = z.infer<typeof plantSpecSchema>;

/** The snapshot fields, in report order; the same names as UC1's contract snapshot. */
export const SNAPSHOT_FIELDS = [
  "parties",
  "effectiveDate",
  "term",
  "survivalPeriod",
  "governingLaw",
  "mutuality",
] as const;

export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

/** UC1's contract snapshot, as the gold case records it. The eval validates it against UC1's schema. */
export interface GoldSnapshot {
  parties: { name: string; role: "discloser" | "recipient" | "both" }[];
  effectiveDate:
    | { kind: "date"; value: string }
    | { kind: "last-signature" }
    | { kind: "not-stated" };
  term: { kind: "fixed"; months: number } | { kind: "until-terminated"; noticeDays: number };
  survivalPeriod: { kind: "fixed"; months: number } | { kind: "indefinite" };
  governingLaw: Jurisdiction;
  mutuality: "mutual" | "one-way";
}

/** The snapshot a paralegal should record for the spec's NDA. */
export function goldFromSpec(spec: PlantSpec): GoldSnapshot {
  const { mutuality, effectiveDate, term, survivalPeriod } = spec;
  const role = (index: number) => {
    if (mutuality.kind === "mutual") return "both";
    return index === mutuality.discloser ? "discloser" : "recipient";
  };
  return {
    parties: spec.parties.map(({ name }, index) => ({ name, role: role(index) })),
    effectiveDate:
      effectiveDate.kind === "date"
        ? { kind: "date", value: effectiveDate.value }
        : { kind: effectiveDate.kind },
    term:
      term.kind === "fixed"
        ? { kind: "fixed", months: term.months }
        : { kind: "until-terminated", noticeDays: term.noticeDays },
    survivalPeriod:
      survivalPeriod.kind === "fixed"
        ? { kind: "fixed", months: survivalPeriod.months }
        : { kind: "indefinite" },
    governingLaw: spec.governingLaw,
    mutuality: mutuality.kind,
  };
}
