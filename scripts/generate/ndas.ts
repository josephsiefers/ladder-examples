import { join } from "node:path";
import { assembleNda } from "./assemble";
import { loadLibrary } from "./library";
import { NDA_COVERAGE } from "./nda-plants";
import { loadPlantSpecs } from "./plants";
import type { Corpus } from "./run-corpus";
import type { PlantSpec } from "./spec";

/**
 * The NDA corpus: each plant spec's NDA goes into the fake firm, and its gold case into the
 * snapshot eval.
 */
export const NDA_CORPUS: Corpus<PlantSpec> = {
  noun: "NDAs",
  coverage: NDA_COVERAGE,
  async load({ plantsDir }) {
    const [library, specs] = await Promise.all([loadLibrary(), loadPlantSpecs(plantsDir)]);
    return {
      specs,
      filesOf(spec) {
        const nda = assembleNda(spec, library);
        return [
          { path: join("data/firm/contracts", `${nda.contractId}.md`), content: nda.markdown },
          {
            path: join("data/evals/snapshot", nda.split, `${nda.contractId}.json`),
            content: `${JSON.stringify(nda.goldCase, null, 2)}\n`,
          },
        ];
      },
    };
  },
};
