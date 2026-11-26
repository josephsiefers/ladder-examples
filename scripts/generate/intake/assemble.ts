import { parseContract, TITLE_EVIDENCE } from "../../../src/core/documents";
import { createRng } from "../rng";
import { fillTemplate } from "../template";
import type { IntakeLibrary, Kind } from "./library";
import type { IntakeGoldCase, IntakePlantSpec } from "./spec";

export interface GeneratedIntake {
  documentId: string;
  split: IntakePlantSpec["split"];
  /** The intake document as the firm receives it. */
  markdown: string;
  goldCase: IntakeGoldCase;
}

type LibraryBase = Extract<IntakePlantSpec["base"], { source: "library" }>;

/**
 * Builds one intake document from its plant spec, and its gold case with it. A library base is
 * assembled from seeded title, opening and section variants; an NDA base is a UC1 contract,
 * copied byte for byte from `contracts` (by contract ID). Gold cites the title and the paragraphs
 * that establish primary purpose. Fails on a spec whose answer key would not hold by construction.
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
  for (const name of spec.ingredients) fail(`no ingredient ${name} in the intake library.`);

  const { markdown, evidence } =
    base.source === "library"
      ? assembleFromKind(base, kindOf(base.kind), spec.seed)
      : copyNda(
          base.contractId,
          contracts.get(base.contractId) ?? fail(`no contract ${base.contractId} to copy.`),
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

/** Section 1 is the opening, then every section in library order, each from a seeded variant. */
function assembleFromKind(base: LibraryBase, kind: Kind, seed: number): Assembled {
  const rng = createRng(seed);
  const title = rng.pick(kind.titles);
  const opening = rng.pick(kind.openings);
  const sections = [
    { heading: kind.openingHeading, paragraphs: opening },
    ...kind.sections.map(({ heading, variants }) => ({ heading, paragraphs: rng.pick(variants) })),
  ];
  const [first, second] = base.parties;
  const values = {
    first: first.name,
    firstShort: first.short,
    second: second.name,
    secondShort: second.short,
  };
  const lines = [`# ${title}`];
  for (const [index, section] of sections.entries()) {
    const number = index + 1;
    lines.push("", `## ${number}. ${section.heading}`);
    for (const [at, text] of section.paragraphs.entries()) {
      lines.push("", `${number}.${at + 1} ${fillTemplate(text, values, `intake/${base.kind}`)}`);
    }
  }
  return {
    markdown: `${lines.join("\n")}\n`,
    evidence: opening.map((_, at) => `1.${at + 1}`),
  };
}

/**
 * A UC1 NDA, unchanged. Gold cites the last paragraph of section 1, where UC1 states who
 * discloses to whom, and the first of section 2, the definition of confidential information,
 * which UC1 always puts there.
 */
function copyNda(contractId: string, source: string, fail: (message: string) => never): Assembled {
  const [opening, definitions] = parseContract(contractId, source).sections;
  const last = opening?.paragraphs.at(-1)?.id;
  const definition = definitions?.paragraphs[0]?.id;
  if (last === undefined || definition === undefined) {
    return fail(`contract ${contractId} has no section 2 to cite.`);
  }
  return { markdown: source, evidence: [last, definition] };
}
