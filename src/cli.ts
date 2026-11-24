import { relative, resolve } from "node:path";
import { Argument, Command, CommanderError, InvalidArgumentError, Option } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { createFirmDocuments, type FirmDocuments } from "./core/documents";
import {
  buildReviewSheet,
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
  type Llm,
} from "./core/llm";
import { createSnapshotEval, snapshotContract } from "./usecases/01-contract-snapshot";
import {
  createTriageEval,
  type TriageResult,
  triageAll,
  triageDocument,
} from "./usecases/02-intake-triage";

/**
 * Everything a command touches outside its own code, so tests can run the CLI offline. `llm` is
 * the live LLM; commands call it through the LLM cache in `llmCache`.
 */
export interface CliDeps {
  llm: Llm;
  documents: FirmDocuments;
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
  reviewSheet?: boolean;
  record?: string;
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
  deps.stdout(renderReport(record, definition.target, definition.analysis?.(record, cases)));
  deps.stdout(`\nRun record: ${relative(process.cwd(), path)}`);
}

/**
 * Builds the answer-key review sheet of a chosen run record, or else the latest one of the split,
 * and saves it beside the record. No model is called.
 */
async function reviewSheetCommand<Input, Value>(
  definition: EvalDefinition<Input, Value>,
  { split, record: chosen }: EvalOptions,
  deps: CliDeps,
): Promise<void> {
  const { record, path } = chosen
    ? await deps.evalStore.loadRunRecord(resolve(chosen))
    : await deps.evalStore.latestRunRecord(definition.name, split);
  const shownPath = relative(process.cwd(), path);
  if (record.eval !== definition.name) {
    throw new Error(
      `Run record ${shownPath} is of eval '${record.eval}', not '${definition.name}'.`,
    );
  }
  deps.stderr(`Building the review sheet of ${shownPath}…`);
  const cases = await deps.evalStore.loadCases(definition, record.split);
  const sheet = await buildReviewSheet(definition, record, cases);
  const sheetPath = await deps.evalStore.saveReviewSheet(record, sheet.markdown);
  deps.stdout(`Review sheet: ${relative(process.cwd(), sheetPath)} · ${sheet.summary}`);
}

/** One triaged document on one line, e.g. `intake-hand-02 · msa → commercial · routed (position 1)`. */
function triageLine({ documentId, classification, queue, receipt }: TriageResult): string {
  const routed = receipt ? `routed (position ${receipt.position})` : "not routed";
  return `${documentId} · ${classification.docType} → ${queue} · ${routed}`;
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

  program
    .command("triage")
    .description(
      "UC2: classify an intake document's type and name its queue; --route files it there",
    )
    .argument("[documentId]", "intake document ID in the firm's intake, e.g. intake-hand-03")
    .option("--all", "triage every intake document, printing one line each")
    .option("--route", "route each document to its queue (from the routing table, not the model)")
    .action(
      async (
        documentId: string | undefined,
        { all, route }: { all?: boolean; route?: boolean },
      ) => {
        if ((documentId === undefined) === !all) {
          throw new Error("Name one intake document ID, or pass --all.");
        }
        const options = { route: route === true };
        if (all) {
          for (const result of await triageAll(cachedDeps(), options)) {
            deps.stdout(triageLine(result));
          }
          return;
        }
        const result = await triageDocument(documentId ?? "", cachedDeps(), options);
        deps.stdout(JSON.stringify(result.classification, null, 2));
        deps.stdout(
          result.receipt
            ? `routed to ${result.queue} (position ${result.receipt.position}, ${result.receipt.routedAt})`
            : `queue ${result.queue} (not routed; pass --route to file it)`,
        );
        deps.stdout(formatCallSummary(result));
      },
    );

  const evals: Record<string, (options: EvalOptions) => Promise<void>> = {
    snapshot: (options) =>
      (options.reviewSheet ? reviewSheetCommand : runEvalCommand)(
        createSnapshotEval(deps),
        options,
        cachedDeps(),
      ),
    triage: (options) =>
      (options.reviewSheet ? reviewSheetCommand : runEvalCommand)(
        createTriageEval(deps),
        options,
        cachedDeps(),
      ),
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
    .option(
      "--review-sheet",
      "instead of running the eval, build the answer-key review sheet of the split's latest run record",
    )
    .addOption(
      new Option(
        "--record <path>",
        "with --review-sheet: the run record to review instead of the latest (its own split is used)",
      ).implies({ reviewSheet: true }),
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
