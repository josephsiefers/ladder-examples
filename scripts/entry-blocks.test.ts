import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Stryker puts its mutants into the test process; a test that spawns a script runs it without them,
// so an entry block's mutants always survive. Every entry block is wrapped in a disable/restore pair.

const REPO = fileURLToPath(new URL("../", import.meta.url));
const ENTRY = "if (import.meta.main)";
const DISABLE = "// Stryker disable all";
const RESTORE = "// Stryker restore all";

/** Every non-test `.ts` file under `src/` and `scripts/`, minus the boundary fixtures and the CLI. */
function sourceFiles(): string[] {
  return ["src", "scripts"]
    .flatMap((dir) =>
      readdirSync(join(REPO, dir), { recursive: true, encoding: "utf8" }).map((path) =>
        join(dir, path).replaceAll("\\", "/"),
      ),
    )
    .filter((path) => path.endsWith(".ts") && !/\.(test|fixtures)\.ts$/.test(path))
    .filter((path) => !path.startsWith("scripts/fixtures/") && path !== "src/cli.ts")
    .toSorted();
}

const directive = (line: string) => line.trimStart().startsWith("// Stryker ");

/**
 * Whether every entry block in `source` sits inside a disable/restore pair: the nearest Stryker
 * directive before it disables all, and the nearest one after it restores all.
 */
function entryBlocksDisabled(source: string): boolean {
  const lines = source.split("\n");
  return lines.every((line, index) => {
    if (!line.startsWith(ENTRY)) return true;
    const before = lines.slice(0, index).findLast(directive);
    const after = lines.slice(index + 1).find(directive);
    return (
      before?.trimStart().startsWith(DISABLE) === true &&
      after?.trimStart().startsWith(RESTORE) === true
    );
  });
}

describe("entryBlocksDisabled", () => {
  const block = `${ENTRY} {\n  run();\n}`;

  it("passes a file without an entry block", () => {
    expect(entryBlocksDisabled("export const x = 1;\n")).toBe(true);
  });

  it("passes an entry block wrapped in the comment pair", () => {
    expect(entryBlocksDisabled(`${DISABLE}: entry block\n${block}\n${RESTORE}\n`)).toBe(true);
  });

  it.each([
    ["no comments", `${block}\n`],
    ["only the disable comment", `${DISABLE}: entry block\n${block}\n`],
    ["only the restore comment", `${block}\n${RESTORE}\n`],
    ["a restore between them", `${DISABLE}: x\n${RESTORE}\n${block}\n${RESTORE}\n`],
    ["a disable after it instead of a restore", `${DISABLE}: x\n${block}\n${DISABLE}: y\n`],
  ])("fails an entry block with %s", (_, source) => {
    expect(entryBlocksDisabled(source)).toBe(false);
  });
});

describe("script entry blocks", () => {
  it("finds the scripts that have one", () => {
    const withEntry = sourceFiles().filter((path) =>
      readFileSync(join(REPO, path), "utf8").includes(ENTRY),
    );
    expect(withEntry).toEqual(
      expect.arrayContaining([
        "scripts/check-context.ts",
        "scripts/check-tokens.ts",
        "scripts/generate.ts",
      ]),
    );
  });

  it.each(sourceFiles())("%s keeps any entry block out of mutation testing", (path) => {
    const source = readFileSync(join(REPO, path), "utf8");
    const problem = entryBlocksDisabled(source)
      ? ""
      : `${path}: tests can't reach its \`${ENTRY}\` block, so its mutants always survive. ` +
        `Put \`${DISABLE}: entry block, unreachable in-process\` on the line before the block ` +
        `and \`${RESTORE}\` on the line after it.`;
    expect(problem).toBe("");
  });
});
