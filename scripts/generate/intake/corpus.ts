import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

/** A document type and ambiguity, as one row of the intake coverage table: e.g. "nda · clean". */
const cell = ({ docType, ambiguity }: IntakePlantSpec) => `${docType} · ${ambiguity}`;

/** What the intake corpus must cover, so far: clean NDAs, MSAs and SOWs, in each split. */
export const INTAKE_COVERAGE: CoveragePlan<IntakePlantSpec> = {
  label: "Type · ambiguity",
  plants: ["nda · clean", "msa · clean", "sow · clean"],
  plantsOf: (spec) => [cell(spec)],
  minimums: { dev: 2, test: 1 },
};

/** The contracts the specs copy, by contract ID, read from `dir`. */
async function loadCopiedContracts(
  specs: readonly IntakePlantSpec[],
  dir: string = CONTRACTS_DIR,
): Promise<Map<string, string>> {
  const ids = specs.flatMap(({ base }) => (base.kind === "nda-copy" ? [base.contractId] : []));
  const entries = await Promise.all(
    ids.map(async (id) => {
      const source = await readFile(join(dir, `${id}.md`), "utf8").catch(() => undefined);
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
