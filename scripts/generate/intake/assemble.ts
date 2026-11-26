import { type DocType, TITLE_EVIDENCE } from "../../../src/core/documents";
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

type LibraryBase = Extract<IntakePlantSpec["base"], { kind: "library" }>;

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
  const built =
    base.kind === "library"
      ? fromKind(
          library.kinds[base.name] ?? fail(`no kind ${base.name} in the intake library.`),
          base,
          spec.seed,
        )
      : {
          docType: "nda" as const,
          assemble: () =>
            copyNda(
              contracts.get(base.contractId) ?? fail(`no contract ${base.contractId} to copy.`),
            ),
        };
  if (built.docType !== spec.docType) {
    fail(`its document type is ${spec.docType}, but its base document is a ${built.docType}.`);
  }
  for (const name of spec.ingredients) fail(`no ingredient ${name} in the intake library.`);

  const { markdown, evidence } = built.assemble();
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

/** A base document's type, and how to build it once the spec is known to be sound. */
interface Base {
  docType: DocType;
  assemble(): Assembled;
}

function fromKind(kind: Kind, base: LibraryBase, seed: number): Base {
  return { docType: kind.docType, assemble: () => assembleFromKind(base, kind, seed) };
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
      lines.push("", `${number}.${at + 1} ${fillTemplate(text, values, `intake/${base.name}`)}`);
    }
  }
  return {
    markdown: `${lines.join("\n")}\n`,
    evidence: opening.map((_, at) => `1.${at + 1}`),
  };
}

/**
 * A UC1 NDA, unchanged. Gold cites the last paragraph of section 1, where UC1 states who
 * discloses to whom, and 2.1, the definition of confidential information, which UC1 always puts
 * first.
 */
function copyNda(source: string): Assembled {
  const opening = source.split("\n").filter((line) => /^1\.\d+ /.test(line));
  const last = opening.at(-1)?.split(" ")[0] ?? "1.1";
  return { markdown: source, evidence: [last, "2.1"] };
}
