import { fileURLToPath } from "node:url";
import { NDA_CORPUS } from "./generate/ndas";
import { type RunCorpusOptions, runCorpus } from "./generate/run-corpus";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Builds one corpus and returns the exit code. */
export type Subcommand = (options: RunCorpusOptions) => Promise<number>;

/** Every corpus the generator builds, by subcommand. */
const CORPORA: Record<string, Subcommand> = {
  ndas: (options) => runCorpus(NDA_CORPUS, options),
};

export interface GenerateOptions {
  /** Where the generated files are written, e.g. `data/firm/contracts/`. Defaults to the repo root. */
  outRoot?: string;
  /** Replaces the corpus's plant spec directory. */
  plantsDir?: string;
  /** The subcommands; defaults to every corpus. */
  corpora?: Record<string, Subcommand>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/**
 * `generate <corpus>`: builds the named corpus (see `CORPORA`), after checking its coverage
 * minimums. `generate ndas` builds every plant spec's NDA into the fake firm and its gold case into
 * the snapshot eval. Returns the exit code.
 */
export async function runGenerate(
  argv: readonly string[],
  options: GenerateOptions,
): Promise<number> {
  const { outRoot = REPO_ROOT, corpora = CORPORA, plantsDir, stdout, stderr } = options;
  const [name] = argv;
  const subcommand =
    argv.length === 1 && name !== undefined && Object.hasOwn(corpora, name)
      ? corpora[name]
      : undefined;
  if (subcommand === undefined) {
    stderr(`usage: npm run generate -- ${Object.keys(corpora).join(" | ")}`);
    return 2;
  }
  return subcommand({ outRoot, stdout, stderr, ...(plantsDir && { plantsDir }) });
}

if (import.meta.main) {
  process.exitCode = await runGenerate(process.argv.slice(2), {
    stdout: (text) => console.log(text),
    stderr: (text) => console.error(text),
  });
}
