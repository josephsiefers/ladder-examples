import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const DEPCRUISE = fileURLToPath(new URL("../node_modules/.bin/depcruise", import.meta.url));
const CONFIG = fileURLToPath(new URL("../.dependency-cruiser.cjs", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./fixtures/boundaries/", import.meta.url));

interface Violation {
  from: string;
  to: string;
  rule: { name: string };
}

/** Runs the real boundary config over the fixture tree, as `npm run depcruise` does over the project. */
function cruise(outputType: "json" | "err-long") {
  const result = spawnSync(
    DEPCRUISE,
    ["src", "scripts", "--config", CONFIG, "--output-type", outputType],
    { cwd: FIXTURE, encoding: "utf8" },
  );
  return { status: result.status, stdout: result.stdout };
}

/** Every rule violation in the fixture tree, from one cruise shared by every test. */
let violations: { rule: string; from: string }[];

describe("module boundaries", () => {
  beforeAll(() => {
    const report = JSON.parse(cruise("json").stdout) as { summary: { violations: Violation[] } };
    violations = report.summary.violations.map(({ rule, from }) => ({ rule: rule.name, from }));
  });

  it("blocks a use case that imports the filesystem", () => {
    expect(violations).toContainEqual({
      rule: "fs-only-where-allowed",
      from: "src/usecases/01-reads-fs/index.ts",
    });
  });

  it("blocks the SDK outside the LLM module", () => {
    expect(violations).toContainEqual({
      rule: "sdk-only-in-llm",
      from: "src/core/documents/index.ts",
    });
  });

  it("blocks an import that bypasses a module's index.ts", () => {
    expect(violations).toContainEqual({
      rule: "public-entry-only",
      from: "src/core/eval/index.ts",
    });
  });

  it("blocks the same bypass from outside every module", () => {
    expect(violations).toContainEqual({ rule: "public-entry-only", from: "scripts/report.ts" });
  });

  it("blocks a use case that imports another use case", () => {
    expect(violations).toContainEqual({
      rule: "no-usecase-to-usecase",
      from: "src/usecases/02-imports-usecase/index.ts",
    });
  });

  it("blocks anything but the CLI from importing a use case", () => {
    expect(violations).toContainEqual({
      rule: "usecases-only-from-cli",
      from: "src/core/report/index.ts",
    });
  });

  it("blocks circular dependencies", () => {
    expect(violations).toContainEqual({ rule: "no-circular", from: "src/core/cycle/a.ts" });
  });

  it("passes the clean module, its SDK use, and the CLI's use-case import", () => {
    const clean = ["src/core/llm/", "src/cli.ts", "scripts/generate.ts"];
    const flagged = violations.filter(({ from }) => clean.some((path) => from.startsWith(path)));

    expect(flagged).toEqual([]);
  });

  it("fails and prints what to do instead", () => {
    const { status, stdout } = cruise("err-long");

    expect(status).not.toBe(0);
    expect(stdout).toContain("error fs-only-where-allowed: src/usecases/01-reads-fs/index.ts");
    expect(stdout).toContain("read firm data through an");
  });
});
