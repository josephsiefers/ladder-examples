import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

/** The most tokens a committed file may hold, so any one file fits comfortably in an agent's context. */
export const TOKEN_LIMIT = 5_000;

/** Approximate token count: characters ÷ 4, rounded up. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Lockfiles are generated, so their size is not the author's to control. */
const EXEMPT_FILE_NAMES = new Set(["package-lock.json", "npm-shrinkwrap.json"]);

/** Generated or machine-written trees: the committed LLM cache, fake-firm writes, eval reports. */
const EXEMPT_DIRECTORIES = [".cache/llm/", "out/", "reports/"];

/** Whether a repo-relative, `/`-separated path skips the token check. */
export function isExempt(path: string): boolean {
  return (
    EXEMPT_FILE_NAMES.has(baseName(path)) || EXEMPT_DIRECTORIES.some((dir) => path.startsWith(dir))
  );
}

/** Git's own heuristic: content is binary if a NUL byte appears in its first 8,000 bytes. */
const BINARY_SNIFF_BYTES = 8_000;

export function isBinary(content: Uint8Array): boolean {
  return content.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

/** How to split an oversized file. Printed in full on every failure, whatever the file's kind. */
const SPLITTING_ADVICE = `Split each file before you commit. Do not delete code or squash it onto fewer
lines to get under the limit.

How to split:
- Find the seams. Look for groups of functions, types, or tests that change
  together and share little with the rest of the file.
- Modules (src/core/<name>/, src/usecases/<name>/): move the logic into sibling
  files in the same folder. Keep index.ts as the module's only entry point and
  re-export from it, so importers do not change.
- Tests: split by the behaviour under test, one file per area, kept next to the
  code (for example cache.replay.test.ts, cache.keys.test.ts). Move shared
  fixtures into a fixtures file in the same folder (cache.fixtures.ts).
- Scripts and data: move large data literals into their own files under data/
  and load or import them. JSON data: one record per file.
- Markdown: split by top-level section into sibling files linked from an index.

When you are done, stage the result (the check reads the index, not the
working tree) and commit again. Never bypass this hook with --no-verify.
`;

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export interface FileContent {
  /** Repo-relative, `/`-separated. */
  path: string;
  content: Uint8Array;
}

export interface Violation {
  path: string;
  tokens: number;
}

/** The non-exempt text files whose estimate exceeds {@link TOKEN_LIMIT}. */
export function findViolations(files: readonly FileContent[]): Violation[] {
  const decoder = new TextDecoder();
  return files
    .filter((file) => !isExempt(file.path) && !isBinary(file.content))
    .map((file) => ({ path: file.path, tokens: estimateTokens(decoder.decode(file.content)) }))
    .filter((violation) => violation.tokens > TOKEN_LIMIT);
}

/** The failure message: one line per file, then advice an agent can act on. */
export function formatReport(violations: readonly Violation[]): string {
  const count = violations.length === 1 ? "1 file is" : `${violations.length} files are`;
  const lines = [
    `Token-size check failed: ${count} over the limit of ${formatNumber(TOKEN_LIMIT)} tokens (estimated as characters ÷ 4).`,
    "",
  ];
  for (const { path, tokens } of violations) {
    lines.push(`${path}: ~${formatNumber(tokens)} tokens (limit ${formatNumber(TOKEN_LIMIT)})`);
  }
  lines.push("", SPLITTING_ADVICE);
  return lines.join("\n");
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

const USAGE = "Usage: check-tokens --staged | check-tokens <path>...";

/** Large enough for any file worth committing; the default (1 MiB) would crash on big blobs. */
const MAX_BUFFER = 256 * 1024 * 1024;

function git(args: readonly string[], cwd: string): Buffer {
  return execFileSync("git", args, { cwd, maxBuffer: MAX_BUFFER });
}

/**
 * Staged additions, copies, modifications and renames, read from the index rather than the
 * working tree, because the index is what gets committed. Paths are repo-root-relative.
 */
function readStagedFiles(cwd: string): FileContent[] {
  const root = repoRoot(cwd);
  const paths = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], root)
    .toString()
    .split("\0")
    .filter(Boolean);
  return paths.map((path) => ({ path, content: git(["show", `:${path}`], root) }));
}

/** Explicit paths, resolved against `cwd`, read from the working tree and named relative to the repo root. */
function readPaths(paths: readonly string[], cwd: string): FileContent[] {
  const root = repoRoot(cwd);
  return paths.map((path) => {
    const absolute = resolve(cwd, path);
    return {
      path: relative(root, realpathSync(absolute)).split(sep).join("/"),
      content: readFileSync(absolute),
    };
  });
}

function repoRoot(cwd: string): string {
  return git(["rev-parse", "--show-toplevel"], cwd).toString().trim();
}

export interface CheckResult {
  /** The process exit code: 0 pass, 1 violations, 2 usage error. */
  status: number;
  stderr: string;
}

/** Runs the check as the command line would from `cwd`, without touching the process. */
export function runCheck(argv: readonly string[], cwd: string): CheckResult {
  const args = parseArguments(argv);
  if (!args) return { status: 2, stderr: `${USAGE}\n` };
  const files = args.staged ? readStagedFiles(cwd) : readPaths(args.paths, cwd);
  const violations = findViolations(files);
  if (violations.length === 0) return { status: 0, stderr: "" };
  return { status: 1, stderr: formatReport(violations) };
}

/** Either `--staged` or one or more paths, never both; `undefined` for anything else. */
function parseArguments(argv: readonly string[]): { staged: boolean; paths: string[] } | undefined {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: { staged: { type: "boolean", default: false } },
      allowPositionals: true,
    });
    const hasPaths = positionals.length > 0;
    return values.staged === hasPaths ? undefined : { staged: values.staged, paths: positionals };
  } catch {
    return undefined;
  }
}

// Stryker disable all: entry block, unreachable in-process
if (import.meta.main) {
  const { status, stderr } = runCheck(process.argv.slice(2), process.cwd());
  process.stderr.write(stderr);
  process.exitCode = status;
}
// Stryker restore all
