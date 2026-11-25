import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleNda } from "./generate/assemble";
import { COVERAGE_MINIMUMS, coverage, renderCoverageTable } from "./generate/coverage";
import { assembleIntake } from "./generate/intake/assemble";
import { intakeCoverage, renderIntakeCoverage } from "./generate/intake/coverage";
import { loadIntakeLibrary } from "./generate/intake/library";
import { intakePlantSpecSchema } from "./generate/intake/spec";
import { loadLibrary } from "./generate/library";
import { loadPlantSpecs, loadSpecs } from "./generate/plants";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

const USAGE = "usage: npm run generate -- ndas | intake";

/** One plant spec per generated intake document. */
const INTAKE_PLANTS_DIR = join(REPO_ROOT, "data/evals/triage/plants");

export interface GenerateOptions {
  /** Where `data/firm/…` and `data/evals/<eval>/<split>/` are written. */
  outRoot?: string;
  /** The corpus's plant specs, instead of the committed ones. */
  plantsDir?: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface GeneratedFile {
  path: string;
  content: string;
}

async function writeFiles(outRoot: string, files: readonly GeneratedFile[]): Promise<void> {
  for (const { path, content } of files) {
    const target = join(outRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

/**
 * `generate ndas` builds every NDA plant spec's contract into the fake firm and its gold case
 * into the snapshot eval; `generate intake` builds the intake corpus and the triage eval's gold
 * cases. Each checks its coverage first and writes nothing if it falls short. Returns the exit code.
 */
export async function runGenerate(
  argv: readonly string[],
  options: GenerateOptions,
): Promise<number> {
  if (argv.length !== 1 || (argv[0] !== "ndas" && argv[0] !== "intake")) {
    options.stderr(USAGE);
    return 2;
  }
  return argv[0] === "ndas" ? generateNdas(options) : generateIntake(options);
}

async function generateNdas(options: GenerateOptions): Promise<number> {
  const { outRoot = REPO_ROOT, stdout, stderr } = options;
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
  await writeFiles(outRoot, files);
  const count = (split: string) => specs.filter((spec) => spec.split === split).length;
  stdout(
    `\nWrote ${specs.length} NDAs (${count("dev")} dev, ${count("test")} test) and their gold cases.`,
  );
  return 0;
}

async function generateIntake(options: GenerateOptions): Promise<number> {
  const { outRoot = REPO_ROOT, stdout, stderr } = options;
  const [library, specs] = await Promise.all([
    loadIntakeLibrary(),
    loadSpecs(options.plantsDir ?? INTAKE_PLANTS_DIR, intakePlantSpecSchema),
  ]);
  const covered = intakeCoverage(specs);
  stdout(renderIntakeCoverage(covered));
  if (covered.short.length > 0) {
    stderr(
      `error: intake coverage not met: ${covered.short.join("; ")}; add or change plant specs.`,
    );
    return 1;
  }
  // Copies come from the committed contracts, so each firm system stays self-contained.
  const sources = specs.flatMap((spec) =>
    spec.base.kind === "nda-copy" ? [spec.base.contractId] : [],
  );
  const contracts = new Map(
    await Promise.all(
      [...new Set(sources)].map(
        async (id) =>
          [id, await readFile(join(REPO_ROOT, "data/firm/contracts", `${id}.md`), "utf8")] as const,
      ),
    ),
  );
  const files = specs.flatMap((spec) => {
    const document = assembleIntake(spec, library, contracts);
    return [
      { path: join("data/firm/intake", `${document.documentId}.md`), content: document.markdown },
      {
        path: join("data/evals/triage", document.split, `${document.documentId}.json`),
        content: `${JSON.stringify(document.goldCase, null, 2)}\n`,
      },
    ];
  });
  await writeFiles(outRoot, files);
  const count = (filter: (spec: (typeof specs)[number]) => boolean) => specs.filter(filter).length;
  stdout(
    `\nWrote ${specs.length} intake documents (${count((s) => s.split === "dev")} dev, ${count((s) => s.split === "test")} test, ${count((s) => s.ambiguity === "hybrid")} hybrid) and their gold cases.`,
  );
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runGenerate(process.argv.slice(2), {
    stdout: (text) => console.log(text),
    stderr: (text) => console.error(text),
  });
}
