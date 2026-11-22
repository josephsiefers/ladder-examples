import { Command, CommanderError } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { createFirmDocuments } from "./core/documents";
import { createAnthropicLlm, formatCallSummary } from "./core/llm";
import { type SnapshotDeps, snapshotContract } from "./usecases/01-contract-snapshot";

/** Everything a command touches outside its own code, so tests can run the CLI offline. */
export interface CliDeps extends SnapshotDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export function buildProgram(deps: CliDeps): Command {
  const program = new Command("ladder")
    .description(packageJson.description)
    .version(packageJson.version)
    .exitOverride();

  program
    .command("snapshot")
    .description("UC1: record the contract snapshot of one contract (single call)")
    .argument("<contractId>", "contract ID in the firm's contracts, e.g. nda-sample-01")
    .action(async (contractId: string) => {
      const result = await snapshotContract(contractId, deps);
      deps.stdout(JSON.stringify(result.snapshot, null, 2));
      deps.stdout(formatCallSummary(result));
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
    documents: createFirmDocuments(),
    stdout: (text) => console.log(text),
    stderr: (text) => console.error(text),
  });
}
