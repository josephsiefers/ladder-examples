import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC_TYPES } from "../../../src/core/documents";
import type { CoveragePlan } from "../coverage";
import { loadSpecs } from "../plants";
import type { Corpus } from "../run-corpus";
import { assembleIntake } from "./assemble";
import { loadIntakeLibrary } from "./library";
import { type IntakePlantSpec, intakePlantSpecSchema } from "./spec";

/** One plant spec per generated intake document, named `<id>.json`. */
const PLANTS_DIR = fileURLToPath(new URL("../../../data/evals/triage/plants/", import.meta.url));

/** UC1's generated contracts, which NDA copies are taken from. */
const CONTRACTS_DIR = fileURLToPath(new URL("../../../data/firm/contracts/", import.meta.url));

/** The row that counts hybrid documents, of any type. */
const HYBRID = "hybrid";

/**
 * What the intake corpus must cover in each split: every document type, and hybrid documents.
 * One row per document type, then a row for hybrids.
 */
export const INTAKE_COVERAGE: CoveragePlan<IntakePlantSpec> = {
  label: "Type, or hybrid",
  plants: [...DOC_TYPES, HYBRID],
  plantsOf: ({ docType, ambiguity }) => (ambiguity === HYBRID ? [docType, HYBRID] : [docType]),
  minimums: { dev: 1, test: 1 },
};

/** The size of the intake corpus in each split (the UC2 spec). */
const SIZE = { dev: 18, test: 12 } as const;

/** The fewest hybrid documents the intake corpus may have (the UC2 spec). */
const MIN_HYBRIDS = 6;

/** The intake corpus's checks beyond its coverage table: its sizes and its number of hybrids. */
export function intakeGate(specs: readonly IntakePlantSpec[]): string[] {
  const errors: string[] = [];
  const dev = specs.filter(({ split }) => split === "dev").length;
  const test = specs.length - dev;
  if (dev !== SIZE.dev || test !== SIZE.test) {
    errors.push(
      `error: the intake corpus has ${specs.length} documents (${dev} dev, ${test} test); it needs ${SIZE.dev + SIZE.test} (${SIZE.dev} dev, ${SIZE.test} test). Add, remove or move plant specs.`,
    );
  }
  const hybrids = specs.filter(({ ambiguity }) => ambiguity === HYBRID).length;
  if (hybrids < MIN_HYBRIDS) {
    errors.push(
      `error: the intake corpus has ${hybrids} hybrid documents; it needs at least ${MIN_HYBRIDS}. Add ingredients to a clean plant spec.`,
    );
  }
  return errors;
}

/** The UC1 contracts the specs copy, by contract ID. A missing one is left out. */
export async function loadCopiedContracts(
  specs: readonly IntakePlantSpec[],
): Promise<Map<string, string>> {
  const ids = specs.flatMap(({ base }) => (base.source === "nda-copy" ? [base.contractId] : []));
  const entries = await Promise.all(
    ids.map(async (id) => {
      const source = await readFile(join(CONTRACTS_DIR, `${id}.md`), "utf8").catch(() => undefined);
      return source === undefined ? [] : [[id, source] as const];
    }),
  );
  return new Map(entries.flat());
}

/**
 * The intake corpus: each plant spec's intake document goes to the fake firm's intake desk, and
 * its gold case into the triage eval.
 */
export const INTAKE_CORPUS: Corpus<IntakePlantSpec> = {
  noun: "intake documents",
  coverage: INTAKE_COVERAGE,
  gate: intakeGate,
  async load({ plantsDir = PLANTS_DIR }) {
    const specs = await loadSpecs(plantsDir, intakePlantSpecSchema);
    const [library, contracts] = await Promise.all([
      loadIntakeLibrary(),
      loadCopiedContracts(specs),
    ]);
    return {
      specs,
      filesOf(spec) {
        const intake = assembleIntake(spec, library, contracts);
        return [
          { path: join("data/firm/intake", `${intake.documentId}.md`), content: intake.markdown },
          {
            path: join("data/evals/triage", intake.split, `${intake.documentId}.json`),
            content: `${JSON.stringify(intake.goldCase, null, 2)}\n`,
          },
        ];
      },
    };
  },
};
