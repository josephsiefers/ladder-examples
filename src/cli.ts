import { relative } from "node:path";
import { Argument, Command, CommanderError, InvalidArgumentError, Option } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { createFirmDocuments } from "./core/documents";
import {
  createEvalStore,
  DEFAULT_CONCURRENCY,
  DEFAULT_RUNS,
  type EvalDefinition,
  type EvalStore,
  renderReport,
  runEval,
  SPLITS,
  type Split,
} from "./core/eval";
import {
  type CacheMode,
  type CacheStore,
  createAnthropicLlm,
  createCachedLlm,
  createFileCacheStore,
  formatCallSummary,
} from "./core/llm";
import {
  createSnapshotEval,
  type SnapshotDeps,
  snapshotContract,
} from "./usecases/01-contract-snapshot";

/**
 * Everything a command touches outside its own code, so tests can run the CLI offline. `llm` is
 * the live LLM; commands call it through the LLM cache in `llmCache`.
 */
export interface CliDeps extends SnapshotDeps {
  llmCache: CacheStore;
  evalStore: EvalStore;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface CacheOptions {
  live?: boolean;
  replayOnly?: boolean;
}

function cacheMode({ live, replayOnly }: CacheOptions): CacheMode {
  if (live) return "live";
  if (replayOnly) return "replay-only";
  return "read-through";
}

interface EvalOptions {
  split: Split;
  runs: number;
  concurrency: number;
}

function positiveInteger(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new InvalidArgumentError("Must be a whole number of at least 1.");
  }
  return number;
}

/** Loads the split's cases, runs them, prints the report and saves the full run record. */
async function runEvalCommand<Input, Value>(
  definition: EvalDefinition<Input, Value>,
  { split, runs, concurrency }: EvalOptions,
  deps: CliDeps,
): Promise<void> {
  const cases = await deps.evalStore.loadCases(definition, split);
  deps.stderr(
    `Running eval ${definition.name} on split ${split}: ${cases.length} case(s) × ${runs} run(s), ${concurrency} at a time…`,
  );
  const record = await runEval(definition, cases, { llm: deps.llm, split, runs, concurrency });
  const path = await deps.evalStore.saveRunRecord(record);
  deps.stdout(renderReport(record, definition.target));
  deps.stdout(`\nRun record: ${relative(process.cwd(), path)}`);
}

export function buildProgram(deps: CliDeps): Command {
  const program = new Command("ladder")
    .description(packageJson.description)
    .version(packageJson.version)
    .exitOverride()
    .configureOutput({ writeErr: (text) => deps.stderr(text.trimEnd()) })
    .addOption(new Option("--live", "call the API for every LLM call and re-record the cache"))
    .addOption(
      new Option(
        "--replay-only",
        "replay LLM calls from the cache only; a miss is an error (no API key needed)",
      ).conflicts("live"),
    );

  /** The deps with the live LLM behind the cache, in the mode the global flags ask for. */
  const cachedDeps = (): CliDeps => ({
    ...deps,
    llm: createCachedLlm(deps.llm, {
      mode: cacheMode(program.opts<CacheOptions>()),
      store: deps.llmCache,
    }),
  });

  program
    .command("snapshot")
    .description("UC1: record the contract snapshot of one contract (single call)")
    .argument("<contractId>", "contract ID in the firm's contracts, e.g. nda-sample-01")
    .action(async (contractId: string) => {
      const result = await snapshotContract(contractId, cachedDeps());
      deps.stdout(JSON.stringify(result.snapshot, null, 2));
      deps.stdout(formatCallSummary(result));
    });

  const evals: Record<string, (options: EvalOptions) => Promise<void>> = {
    snapshot: (options) => runEvalCommand(createSnapshotEval(deps), options, cachedDeps()),
  };
  program
    .command("eval")
    .description(
      "Run an eval with real model calls (cached); print its report and save the run record",
    )
    .addArgument(new Argument("<name>", "the eval to run").choices(Object.keys(evals)))
    .addOption(
      new Option("--split <split>", "dataset split; test runs only when named")
        .choices(SPLITS)
        .default("dev"),
    )
    .option("--runs <n>", "times to run each case", positiveInteger, DEFAULT_RUNS)
    .option(
      "--concurrency <n>",
      "case runs in flight at once",
      positiveInteger,
      DEFAULT_CONCURRENCY,
    )
    .action(async (name: string, options: EvalOptions) => {
      await evals[name]?.(options);
    });

  return program;
}

/** Runs the CLI and returns its exit code. Errors print as one clear line, without a stack trace. */
export async function run(argv: string[], deps: CliDeps): Promise<number> {
  try {
    await buildProgram(deps).parseAsync(argv);
    return 0;
  } catch (error) {
    // Commander has already printed its own usage errors and help.
    if (error instanceof CommanderError) return error.exitCode;
    deps.stderr(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

/** Loads `.envrc` (plain `export KEY=value` lines) with Node's built-in env-file parser, so direnv is optional. The file is optional too. */
function loadOptionalEnvFile(): void {
  try {
    process.loadEnvFile(".envrc");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

if (import.meta.main) {
  loadOptionalEnvFile();
  process.exitCode = await run(process.argv, {
    llm: createAnthropicLlm({ apiKey: process.env.ANTHROPIC_API_KEY }),
    llmCache: createFileCacheStore(),
    documents: createFirmDocuments(),
    evalStore: createEvalStore(),
    stdout: (text) => console.log(text),
    stderr: (text) => console.error(text),
  });
}
