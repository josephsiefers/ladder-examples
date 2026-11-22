import {
  CLAUSE_TYPES,
  type ClauseType,
  type Library,
  STANDARD_VARIANT,
  type Template,
} from "./library";
import { cardinalWords, ordinalSuffix, ordinalWords, wordsWithNumerals } from "./numbers";
import { createRng, type Rng } from "./rng";
import {
  type GoldSnapshot,
  goldFromSpec,
  JURISDICTIONS,
  type PlantSpec,
  SNAPSHOT_FIELDS,
  type SnapshotField,
} from "./spec";
import { fillTemplate } from "./template";

/** A gold case file, as `data/evals/snapshot/<split>/<id>.json` holds it. */
export interface GoldCase {
  input: { contractId: string };
  gold: GoldSnapshot;
  /** Per field, the paragraphs its value landed in; no entry for a value that is not stated. */
  evidence: Partial<Record<SnapshotField, string[]>>;
}

export interface GeneratedNda {
  contractId: string;
  split: PlantSpec["split"];
  /** The contract in the firm's format. */
  markdown: string;
  goldCase: GoldCase;
  /** Per field, the planted values as rendered into its evidence paragraphs. */
  rendered: Partial<Record<SnapshotField, string[]>>;
}

/** The placeholders that carry each field's value. A paragraph carrying one is evidence for it. */
const VALUE_PLACEHOLDERS: Record<SnapshotField, readonly string[]> = {
  parties: ["parties.first", "parties.second"],
  effectiveDate: [
    "effectiveDate.numerals",
    "effectiveDate.numeralsUs",
    "effectiveDate.dayOf",
    "effectiveDate.words",
  ],
  term: ["term.period", "term.notice"],
  survivalPeriod: ["survivalPeriod.period"],
  governingLaw: ["governingLaw.law"],
  mutuality: ["mutuality.discloser", "mutuality.recipient"],
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The clause that always comes first; the rest are shuffled. */
const FIRST_CLAUSE: ClauseType = "confidential-information";

/** Paragraphs from one template, filled from the NDA's values plus `values`. */
interface Block {
  label: string;
  template: Template;
  /** The snapshot field these paragraphs state, if any. */
  field?: SnapshotField;
  values?: Record<string, string>;
}

interface DraftSection {
  heading: string;
  blocks: Block[];
}

/** A period as contracts write it, e.g. "two (2) years" or "eighteen (18) months". */
function period(months: number, unit: "months" | "years"): string {
  const count = unit === "years" ? months / 12 : months;
  const noun = unit === "years" ? "year" : "month";
  return `${wordsWithNumerals(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/** The party's name as the contract writes it, e.g. "Kestrel Bioanalytics Limited and its Affiliates". */
function contractName(party: PlantSpec["parties"][number]): string {
  return party.affiliates ? `${party.name} and its Affiliates` : party.name;
}

/** A per-field record in report order, without the fields it has no entry for. */
function inFieldOrder(record: Partial<Record<SnapshotField, string[]>>) {
  return Object.fromEntries(
    SNAPSHOT_FIELDS.flatMap((field) => (record[field] ? [[field, record[field]]] : [])),
  );
}

/** Every value the NDA's phrasings may use. A placeholder with no value here fails generation. */
function plantedValues(spec: PlantSpec, title: string): Record<string, string> {
  const [first, second] = spec.parties;
  const values: Record<string, string> = {
    title,
    purpose: spec.purpose,
    "parties.first": contractName(first),
    "parties.firstShort": first.short,
    "parties.second": contractName(second),
    "parties.secondShort": second.short,
    "governingLaw.law": JURISDICTIONS[spec.governingLaw].law,
    "courts.courts": JURISDICTIONS[spec.courts].courts,
  };
  const { mutuality, effectiveDate, term, survivalPeriod } = spec;
  if (mutuality.kind === "one-way") {
    values["mutuality.discloser"] = spec.parties[mutuality.discloser].short;
    values["mutuality.recipient"] = spec.parties[1 - mutuality.discloser]?.short ?? "";
  }
  if (effectiveDate.kind === "date") {
    const [year, month, day] = effectiveDate.value.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const monthName = MONTH_NAMES[month - 1] ?? "";
    values["effectiveDate.numerals"] = `${day} ${monthName} ${year}`;
    values["effectiveDate.numeralsUs"] = `${monthName} ${day}, ${year}`;
    values["effectiveDate.dayOf"] = `the ${ordinalSuffix(day)} day of ${monthName} ${year}`;
    values["effectiveDate.words"] =
      `the ${ordinalWords(day)} day of ${monthName}, ${cardinalWords(year)}`;
  }
  if (term.kind === "fixed") {
    values["term.period"] = period(term.months, term.unit);
  } else {
    values["term.notice"] =
      `${wordsWithNumerals(term.noticeDays)} ${term.noticeDays === 1 ? "day's" : "days'"}`;
  }
  if (survivalPeriod.kind === "fixed") {
    values["survivalPeriod.period"] = period(survivalPeriod.months, survivalPeriod.unit);
  }
  return values;
}

/** The library key of each field's phrasing, chosen by the spec. */
function phrasingKeys(spec: PlantSpec) {
  const { mutuality, effectiveDate, survivalPeriod } = spec;
  return {
    effectiveDate: effectiveDate.kind === "date" ? effectiveDate.phrasing : effectiveDate.kind,
    mutuality:
      mutuality.kind === "mutual"
        ? "mutual"
        : mutuality.recital === "mutual-discussions"
          ? "one-way-mutual-discussions"
          : "one-way",
    term: spec.term.kind,
    survivalPeriod: survivalPeriod.kind === "fixed" ? survivalPeriod.phrasing : "indefinite",
  } as const;
}

function draftSections(spec: PlantSpec, library: Library, rng: Rng) {
  const { phrasings } = library;
  const keys = phrasingKeys(spec);
  const title = rng.pick(library.titles[spec.mutuality.kind]);
  const parties: Block = {
    label: "parties/standard",
    template: rng.pick(phrasings.parties.standard),
    field: "parties",
  };
  const effectiveDate: Block | undefined =
    keys.effectiveDate === "not-stated"
      ? undefined
      : {
          label: `effectiveDate/${keys.effectiveDate}`,
          template: rng.pick(phrasings.effectiveDate[keys.effectiveDate]),
          field: "effectiveDate",
        };
  const mutuality: Block = {
    label: `mutuality/${keys.mutuality}`,
    template: rng.pick(phrasings.mutuality[keys.mutuality]),
    field: "mutuality",
  };
  const termWordings = phrasings.term[keys.term];
  const termIndex = rng.pick([...termWordings.keys()]);
  const term: Block = {
    label: `term/${keys.term}`,
    template: termWordings[termIndex] as Template,
    field: "term",
  };
  // A like-term survival wording mirrors the term wording at the same index.
  const survivalWordings = phrasings.survivalPeriod[keys.survivalPeriod];
  const survival: Block = {
    label: `survivalPeriod/${keys.survivalPeriod}`,
    template:
      keys.survivalPeriod === "like-term"
        ? (survivalWordings[termIndex] as Template)
        : rng.pick(survivalWordings),
    field: "survivalPeriod",
  };
  const law: Block = {
    label: "governingLaw/standard",
    template: rng.pick(phrasings.governingLaw.standard),
    field: "governingLaw",
  };
  const signature = rng.pick(phrasings.signature.standard);

  /** Metadata paragraphs that open a clause type's section, before its standard wording. */
  const planted: Partial<Record<ClauseType, Block[]>> = {
    "term-and-survival": [term, survival],
    "governing-law-and-jurisdiction": [law],
  };
  const clauses = new Map(
    CLAUSE_TYPES.map((type) => {
      const variants = library.clauses[type];
      const name = rng.pick(
        Object.keys(variants)
          .filter((n) => STANDARD_VARIANT.test(n))
          .toSorted(),
      );
      const variant = variants[name];
      if (!variant) throw new Error(`No variant ${type}/${name}`);
      const standard: Block = { label: `clauses/${type}/${name}`, template: variant.paragraphs };
      const section: DraftSection = {
        heading: variant.heading,
        blocks: [...(planted[type] ?? []), standard],
      };
      return [type, section] as const;
    }),
  );
  const order = [
    FIRST_CLAUSE,
    ...rng.shuffle(CLAUSE_TYPES.filter((type) => type !== FIRST_CLAUSE)),
  ];

  const sections: DraftSection[] = [
    {
      heading: "Parties and Background",
      blocks: [parties, ...(effectiveDate ? [effectiveDate] : []), mutuality],
    },
    ...order.map((type) => clauses.get(type) as DraftSection),
    {
      heading: "Signatures",
      blocks: spec.parties.map((party) => ({
        label: "signature/standard",
        template: signature,
        values: { "signature.party": party.name },
      })),
    },
  ];
  return { title, sections };
}

/**
 * Builds one NDA from its plant spec: picks clause variants, wordings and clause order with a
 * seeded RNG, numbers it in the firm's format, fills the placeholders, and records gold plus the
 * paragraph each value landed in. The same spec and library always give the same bytes.
 */
export function assembleNda(spec: PlantSpec, library: Library): GeneratedNda {
  const rng = createRng(spec.seed);
  const { title, sections } = draftSections(spec, library, rng);
  const values = plantedValues(spec, title);
  const lines = [`# ${title}`];
  const evidence: Partial<Record<SnapshotField, string[]>> = {};
  const rendered: Partial<Record<SnapshotField, string[]>> = {};

  for (const [index, section] of sections.entries()) {
    const number = index + 1;
    let paragraphCount = 0;
    lines.push("", `## ${number}. ${section.heading}`);
    for (const block of section.blocks) {
      // Standard clause wording takes no values: anything planted there would be a collision.
      const blockValues = block.field || block.values ? { ...values, ...block.values } : {};
      const paragraphs = block.template.map((text) => ({
        id: `${number}.${++paragraphCount}`,
        text: fillTemplate(text, blockValues, block.label),
        carried: VALUE_PLACEHOLDERS[block.field ?? "parties"].filter((name) =>
          block.field ? text.includes(`{{${name}}}`) : false,
        ),
      }));
      for (const { id, text } of paragraphs) lines.push("", `${id} ${text}`);
      if (!block.field) continue;
      const carrying = paragraphs.filter(({ carried }) => carried.length > 0);
      evidence[block.field] = (carrying.length > 0 ? carrying : paragraphs).map(({ id }) => id);
      rendered[block.field] = [
        ...new Set(carrying.flatMap(({ carried }) => carried.map((name) => values[name] ?? ""))),
      ];
    }
  }

  return {
    contractId: spec.id,
    split: spec.split,
    markdown: `${lines.join("\n")}\n`,
    goldCase: {
      input: { contractId: spec.id },
      gold: goldFromSpec(spec),
      evidence: inFieldOrder(evidence),
    },
    rendered: inFieldOrder(rendered),
  };
}
