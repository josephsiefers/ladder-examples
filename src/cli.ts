import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };

export function buildProgram(): Command {
  return new Command("ladder").description(packageJson.description).version(packageJson.version);
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
  await buildProgram().parseAsync();
}
