import { parseContract, TITLE_EVIDENCE } from "../../../src/core/documents";
import { createRng } from "../rng";
import { fillTemplate } from "../template";
import type { Ingredient, IntakeLibrary, Kind } from "./library";
import type { IntakeGoldCase, IntakePlantSpec } from "./spec";

export interface GeneratedIntake {
  documentId: string;
  split: IntakePlantSpec["split"];
  /** The intake document as the firm receives it. */
  markdown: string;
  goldCase: IntakeGoldCase;
}

type LibraryBase = Extract<IntakePlantSpec["base"], { source: "library" }>;

type Rng = ReturnType<typeof createRng>;

/** One section, its paragraphs filled in, before it is numbered. */
interface Section {
  heading: string;
  paragraphs: string[];
}

/** A named ingredient from the intake library. */
interface NamedIngredient extends Ingredient {
  name: string;
}

/**
 * Builds one intake document from its plant spec, and its gold case with it. A library base is
 * assembled from seeded title, opening and section variants; an NDA base is a UC1 contract,
 * copied byte for byte from `contracts` (by contract ID). A hybrid adds its ingredients, each a
 * seeded variant: a section goes before the base document's closing section, a schedule after
 * every section. Gold cites the title and the base document's paragraphs that establish primary
 * purpose. Fails on a spec whose answer key would not hold by construction.
 */
export function assembleIntake(
  spec: IntakePlantSpec,
  library: IntakeLibrary,
  contracts: ReadonlyMap<string, string>,
): GeneratedIntake {
  const fail = (message: string): never => {
    throw new Error(`${spec.id}: ${message}`);
  };
  const { base } = spec;
  const kindOf = (name: string) =>
    library.kinds[name] ?? fail(`no kind ${name} in the intake library.`);
  const baseType = base.source === "library" ? kindOf(base.kind).docType : "nda";
  if (baseType !== spec.docType) {
    fail(`its document type is ${spec.docType}, but its base document is a ${baseType}.`);
  }
  const ingredients = spec.ingredients.map((name) => ({
    name,
    ...(library.ingredients[name] ?? fail(`no ingredient ${name} in the intake library.`)),
  }));
  if (ingredients.length > 0 && ingredients.every(({ docType }) => docType === spec.docType)) {
    fail(
      `a hybrid needs an ingredient of a type other than ${spec.docType}, but every ingredient is a ${spec.docType}.`,
    );
  }

  const rng = createRng(spec.seed);
  const { markdown, evidence } =
    base.source === "library"
      ? assembleFromKind(base, kindOf(base.kind), ingredients, rng)
      : copyNda(
          base.contractId,
          contracts.get(base.contractId) ?? fail(`no contract ${base.contractId} to copy.`),
          ingredients,
          rng,
          fail,
        );
  return {
    documentId: spec.id,
    split: spec.split,
    markdown,
    goldCase: {
      input: { documentId: spec.id },
      gold: { docType: spec.docType, ambiguity: spec.ambiguity },
      evidence: { docType: [TITLE_EVIDENCE, ...evidence] },
    },
  };
}

interface Assembled {
  markdown: string;
  /** The paragraph IDs that establish primary purpose. */
  evidence: string[];
}

/** Each ingredient's seeded variant, filled from `values`, with where it goes. */
function ingredientSections(
  ingredients: readonly NamedIngredient[],
  rng: Rng,
  values: Readonly<Record<string, string>>,
): { sections: Section[]; schedules: Section[] } {
  const filled = ingredients.map(({ name, heading, placement, variants }) => ({
    placement,
    section: {
      heading,
      paragraphs: rng.pick(variants).map((text) => fillTemplate(text, values, `intake/${name}`)),
    },
  }));
  const where = (placement: Ingredient["placement"]) =>
    filled.flatMap((entry) => (entry.placement === placement ? [entry.section] : []));
  return { sections: where("section"), schedules: where("schedule") };
}

/** A numbered section: its heading, then each paragraph with its paragraph ID. */
function renderSection(number: number, { heading, paragraphs }: Section): string[] {
  return [
    `## ${number}. ${heading}`,
    ...paragraphs.flatMap((text, at) => ["", `${number}.${at + 1} ${text}`]),
  ];
}

/** A numbered section as Markdown text, ending in a newline. */
const block = (section: Section, number: number) =>
  `${renderSection(number, section).join("\n")}\n`;

/**
 * Section 1 is the opening, then every section in library order, each from a seeded variant, with
 * the ingredients' sections before the last of them and their schedules after.
 */
function assembleFromKind(
  base: LibraryBase,
  kind: Kind,
  ingredients: readonly NamedIngredient[],
  rng: Rng,
): Assembled {
  const title = rng.pick(kind.titles);
  const opening = rng.pick(kind.openings);
  const [first, second] = base.parties;
  const values = {
    first: first.name,
    firstShort: first.short,
    second: second.name,
    secondShort: second.short,
  };
  const fill = (paragraphs: readonly string[]) =>
    paragraphs.map((text) => fillTemplate(text, values, `intake/${base.kind}`));
  const own: Section[] = [
    { heading: kind.openingHeading, paragraphs: fill(opening) },
    ...kind.sections.map(({ heading, variants }) => ({
      heading,
      paragraphs: fill(rng.pick(variants)),
    })),
  ];
  const added = ingredientSections(ingredients, rng, values);
  const sections = [...own.slice(0, -1), ...added.sections, ...own.slice(-1), ...added.schedules];
  const lines = [`# ${title}`];
  for (const [index, section] of sections.entries()) {
    lines.push("", ...renderSection(index + 1, section));
  }
  return {
    markdown: `${lines.join("\n")}\n`,
    evidence: opening.map((_, at) => `1.${at + 1}`),
  };
}

/** The last section heading of a UC1 contract: its signatures. */
const LAST_SECTION = /^## (\d+)\. /m;

/**
 * A UC1 NDA. Without ingredients it is unchanged; with them, their sections go before its last
 * section (the signatures), which alone is renumbered, and their schedules after it. Ingredients
 * get no party names to fill: a copied NDA has no plant spec parties. Gold cites the last
 * paragraph of section 1, where UC1 states who discloses to whom, and the first of section 2, the
 * definition of confidential information, which UC1 always puts there.
 */
function copyNda(
  contractId: string,
  source: string,
  ingredients: readonly NamedIngredient[],
  rng: Rng,
  fail: (message: string) => never,
): Assembled {
  const [opening, definitions] = parseContract(contractId, source).sections;
  const last = opening?.paragraphs.at(-1)?.id;
  const definition = definitions?.paragraphs[0]?.id;
  if (last === undefined || definition === undefined) {
    return fail(`contract ${contractId} has no section 2 to cite.`);
  }
  const evidence = [last, definition];
  if (ingredients.length === 0) return { markdown: source, evidence };

  const { sections, schedules } = ingredientSections(ingredients, rng, {});
  const start = source.lastIndexOf("\n## ") + 1;
  const closing = source.slice(start);
  const number = Number(LAST_SECTION.exec(closing)?.[1]);
  const moved = number + sections.length;
  const renumbered = closing
    .replace(LAST_SECTION, `## ${moved}. `)
    .replaceAll(new RegExp(`^${number}\\.(\\d+) `, "gm"), `${moved}.$1 `);
  const inserted = sections.map((section, at) => `${block(section, number + at)}\n`);
  const appended = schedules.map((section, at) => `\n${block(section, moved + 1 + at)}`);
  return {
    markdown: [source.slice(0, start), ...inserted, renumbered, ...appended].join(""),
    evidence,
  };
}
