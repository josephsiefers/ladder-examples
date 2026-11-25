import { createRng, type Rng } from "../rng";
import { fillTemplate } from "../template";
import type { Ingredient, IntakeLibrary, LetterParts, Template } from "./library";
import type { DocType, IntakeGoldCase, IntakePlantSpec } from "./spec";

export interface GeneratedIntake {
  documentId: string;
  split: IntakePlantSpec["split"];
  /** The intake document as the firm receives it. */
  markdown: string;
  goldCase: IntakeGoldCase;
}

/** The pseudo paragraph ID gold cites for the document's title. */
export const TITLE_EVIDENCE = "title";

const OPENING_HEADING = "Parties and Background";

interface Section {
  heading: string;
  paragraphs: Template;
}

type LibraryBase = Extract<IntakePlantSpec["base"], { kind: "library" }>;

/**
 * Builds one intake document from its plant spec and gold case with it. A library base is
 * assembled from seeded title, opening and section variants; an NDA base is a UC1 contract,
 * copied byte for byte unless ingredients are added. Gold cites the title and the paragraphs
 * that show primary purpose. Fails on a spec whose answer key would not hold by construction.
 */
export function assembleIntake(
  spec: IntakePlantSpec,
  library: IntakeLibrary,
  contracts: ReadonlyMap<string, string>,
): GeneratedIntake {
  const fail = (message: string): never => {
    throw new Error(`${spec.id}: ${message}`);
  };
  const baseType: DocType =
    spec.base.kind === "nda-copy"
      ? "nda"
      : (library.kinds[spec.base.name] ?? fail(`no kind ${spec.base.name} in the intake library.`))
          .docType;
  if (baseType !== spec.docType) {
    fail(`its document type is ${spec.docType}, but its base document is a ${baseType}.`);
  }
  const ingredients = spec.ingredients.map((name) => {
    const ingredient =
      library.ingredients[name] ?? fail(`no ingredient ${name} in the intake library.`);
    if (ingredient.docType === spec.docType) {
      fail(`ingredient ${name} is itself a ${spec.docType}, so it adds no other type.`);
    }
    return { name, ingredient };
  });

  const { markdown, evidence } =
    spec.base.kind === "nda-copy"
      ? copyNda(
          contracts.get(spec.base.contractId) ??
            fail(`no contract ${spec.base.contractId} to copy.`),
          ingredients.map(({ name, ingredient }) =>
            ingredient.kind === "section"
              ? ingredient
              : fail(`a copied NDA takes only section ingredients, not ${name}.`),
          ),
        )
      : assembleFromLibrary(
          spec.base,
          library,
          ingredients.map(({ ingredient }) => ingredient),
          createRng(spec.seed),
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

function assembleFromLibrary(
  base: LibraryBase,
  library: IntakeLibrary,
  ingredients: readonly Ingredient[],
  rng: Rng,
): { markdown: string; evidence: string[] } {
  const kind = library.kinds[base.name] as NonNullable<IntakeLibrary["kinds"][string]>;
  let title = rng.pick(kind.titles);
  const opening = rng.pick(kind.openings);
  const sections: Section[] = rng.shuffle(
    kind.sections.map(({ heading, variants }) => ({ heading, paragraphs: rng.pick(variants) })),
  );
  const schedules: Section[] = [];
  let letter: LetterParts | undefined = kind.letter;
  for (const ingredient of ingredients) {
    if (ingredient.kind === "section") {
      const section = { heading: ingredient.heading, paragraphs: ingredient.paragraphs };
      if (ingredient.placement === "end") schedules.push(section);
      else sections.splice(rng.pick([...Array(sections.length + 1).keys()]), 0, section);
      continue;
    }
    title = rng.pick(ingredient.titles);
    if (ingredient.kind === "letter") letter = ingredient;
  }

  const [first, second] = base.parties;
  const values = {
    first: first.name,
    firstShort: first.short,
    second: second.name,
    secondShort: second.short,
  };
  const fill = (text: string) => fillTemplate(text, values, `intake/${base.name}`);
  const body = [...sections, ...schedules];
  const lines = [`# ${title}`];
  if (letter) {
    const paragraphs = [...opening, ...body.flatMap((section) => section.paragraphs)];
    lines.push("", fill(letter.salutation));
    for (const [index, text] of paragraphs.entries()) lines.push("", `${index + 1}. ${fill(text)}`);
    lines.push("", fill(letter.signoff));
    return { markdown: `${lines.join("\n")}\n`, evidence: opening.map((_, i) => String(i + 1)) };
  }
  const numbered = [{ heading: OPENING_HEADING, paragraphs: opening }, ...body];
  for (const [index, section] of numbered.entries()) {
    lines.push("", `## ${index + 1}. ${section.heading}`);
    for (const [at, text] of section.paragraphs.entries()) {
      lines.push("", `${index + 1}.${at + 1} ${fill(text)}`);
    }
  }
  return { markdown: `${lines.join("\n")}\n`, evidence: opening.map((_, i) => `1.${i + 1}`) };
}

const SECTION_HEADING = /^## (\d+)\. /;

/**
 * A UC1 NDA as intake: unchanged, or with each section ingredient added before its last
 * section (the signatures), which is renumbered. Gold cites the last paragraph of section 1,
 * where UC1 states the purpose and who discloses, and 2.1, the definition of confidential
 * information, which UC1 always puts first.
 */
function copyNda(
  source: string,
  sections: readonly Extract<Ingredient, { kind: "section" }>[],
): { markdown: string; evidence: string[] } {
  const lines = source.split("\n");
  const opening = lines.filter((line) => /^1\.\d+ /.test(line));
  const evidence = [opening.at(-1)?.split(" ")[0] ?? "1.1", "2.1"];
  if (sections.length === 0) return { markdown: source, evidence };

  const lastAt = lines.findLastIndex((line) => SECTION_HEADING.test(line));
  const last = Number(SECTION_HEADING.exec(lines[lastAt] ?? "")?.[1]);
  const added = sections.flatMap((section, index) => [
    `## ${last + index}. ${section.heading}`,
    "",
    ...section.paragraphs.flatMap((text, at) => [
      `${last + index}.${at + 1} ${fillTemplate(text, {}, `intake/${section.heading}`)}`,
      "",
    ]),
  ]);
  const renumbered = last + sections.length;
  const tail = lines
    .slice(lastAt)
    .map((line) =>
      line
        .replace(SECTION_HEADING, `## ${renumbered}. `)
        .replace(new RegExp(`^${last}\\.(\\d+) `), `${renumbered}.$1 `),
    );
  return {
    markdown: [...lines.slice(0, lastAt), ...added, ...tail].join("\n"),
    evidence,
  };
}
