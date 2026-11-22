import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleNda } from "./generate/assemble";
import { COVERAGE_MINIMUMS, coverage, renderCoverageTable } from "./generate/coverage";
import { loadLibrary } from "./generate/library";
import { loadPlantSpecs } from "./generate/plants";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

const USAGE = "usage: npm run generate -- ndas";

export interface GenerateOptions {
  /** Where `data/firm/contracts/` and `data/evals/snapshot/<split>/` are written. */
  outRoot?: string;
  plantsDir?: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/**
 * `generate ndas`: builds every plant spec's NDA into the fake firm and its gold case into the
 * snapshot eval, after checking the coverage minimums. Returns the exit code.
 */
export async function runGenerate(
  argv: readonly string[],
  options: GenerateOptions,
): Promise<number> {
  const { outRoot = REPO_ROOT, stdout, stderr } = options;
  if (argv.length !== 1 || argv[0] !== "ndas") {
    stderr(USAGE);
    return 2;
  }
  const [library, specs] = await Promise.all([loadLibrary(), loadPlantSpecs(options.plantsDir)]);
  const rows = coverage(specs);
  stdout(renderCoverageTable(rows));
  const short = rows.filter(({ met }) => !met);
  if (short.length > 0) {
    stderr(
      `error: coverage minimums not met (${COVERAGE_MINIMUMS.dev} in dev, ${COVERAGE_MINIMUMS.test} in test) for ${short.length} plant(s); add or change plant specs.`,
    );
    return 1;
  }

  const files = specs.flatMap((spec) => {
    const nda = assembleNda(spec, library);
    return [
      { path: join("data/firm/contracts", `${nda.contractId}.md`), content: nda.markdown },
      {
        path: join("data/evals/snapshot", nda.split, `${nda.contractId}.json`),
        content: `${JSON.stringify(nda.goldCase, null, 2)}\n`,
      },
    ];
  });
  for (const { path, content } of files) {
    const target = join(outRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const count = (split: string) => specs.filter((spec) => spec.split === split).length;
  stdout(
    `\nWrote ${specs.length} NDAs (${count("dev")} dev, ${count("test")} test) and their gold cases.`,
  );
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runGenerate(process.argv.slice(2), {
    stdout: (text) => console.log(text),
    stderr: (text) => console.error(text),
  });
}
