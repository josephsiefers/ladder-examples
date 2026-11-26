import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type CoveragePlan,
  coverage,
  renderCoverageTable,
  type Split,
  shortfall,
} from "./coverage";

/** One file the generator writes: its path relative to the output root, and its content. */
export interface GeneratedFile {
  path: string;
  content: string;
}

/** What a corpus's inputs yield: its plant specs, and the files each spec becomes. */
export interface LoadedCorpus<Spec> {
  specs: Spec[];
  filesOf(spec: Spec): GeneratedFile[];
}

/**
 * One corpus the generator builds, behind a `generate` subcommand. It supplies only what is its
 * own; `runCorpus` does the steps every corpus shares.
 */
export interface Corpus<Spec extends { split: Split }> {
  /** What one spec becomes, in the plural, for the summary: e.g. "NDAs". */
  noun: string;
  coverage: CoveragePlan<Spec>;
  /** Reads the corpus's inputs; `plantsDir`, if given, replaces its plant spec directory. */
  load(options: { plantsDir?: string }): Promise<LoadedCorpus<Spec>>;
}

export interface RunCorpusOptions {
  /** The root every generated file's path is relative to. */
  outRoot: string;
  plantsDir?: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/**
 * Builds a corpus: prints its coverage table, and unless a plant falls short of its minimums or a
 * spec cannot be built, writes every file under the output root and prints what it wrote. Nothing
 * is written unless every spec builds. Returns the exit code.
 */
export async function runCorpus<Spec extends { split: Split }>(
  corpus: Corpus<Spec>,
  { outRoot, plantsDir, stdout, stderr }: RunCorpusOptions,
): Promise<number> {
  const { specs, filesOf } = await corpus.load({ plantsDir });
  const rows = coverage(specs, corpus.coverage);
  stdout(renderCoverageTable(rows, corpus.coverage));
  const error = shortfall(rows, corpus.coverage.minimums);
  if (error !== undefined) {
    stderr(error);
    return 1;
  }

  let files: GeneratedFile[];
  try {
    files = specs.flatMap(filesOf);
  } catch (failure) {
    stderr(`error: ${failure instanceof Error ? failure.message : String(failure)}`);
    return 1;
  }
  for (const { path, content } of files) {
    const target = join(outRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const count = (split: Split) => specs.filter((spec) => spec.split === split).length;
  stdout(
    `\nWrote ${specs.length} ${corpus.noun} (${count("dev")} dev, ${count("test")} test) and their gold cases.`,
  );
  return 0;
}
