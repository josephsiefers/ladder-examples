import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const SCRIPT = fileURLToPath(new URL("./check-tokens.ts", import.meta.url));

const OVERSIZED = `# Big\n${"x".repeat(24_000)}`;

let repo: string;

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
}

function commit(message: string): void {
  const identity = ["-c", "user.name=t", "-c", "user.email=t@example.com"];
  git(...identity, "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message);
}

function write(path: string, text: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function checkTokens(...args: string[]) {
  return checkTokensIn(".", ...args);
}

function checkTokensIn(dir: string, ...args: string[]) {
  const result = spawnSync(TSX, [SCRIPT, ...args], { cwd: join(repo, dir), encoding: "utf8" });
  return { status: result.status, stderr: result.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "check-tokens-"));
  git("init", "--quiet");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("check-tokens --staged", () => {
  it("fails on an oversized staged file, with splitting advice", () => {
    write("big.md", OVERSIZED);
    git("add", "big.md");

    const { status, stderr } = checkTokens("--staged");

    expect(status).toBe(1);
    expect(stderr).toContain("big.md: ~6,002 tokens (limit 5,000)");
    expect(stderr).toContain("top-level section");
  });

  it("reads the index, so shrinking the file without re-staging still fails", () => {
    write("big.md", OVERSIZED);
    git("add", "big.md");
    write("big.md", "# Small\n");

    expect(checkTokens("--staged").status).toBe(1);
  });

  it("reads the index, so a small staged file passes even if the working tree grew", () => {
    write("notes.md", "# Small\n");
    git("add", "notes.md");
    write("notes.md", OVERSIZED);

    expect(checkTokens("--staged")).toEqual({ status: 0, stderr: "" });
  });

  it("passes an oversized exempt path", () => {
    write("reports/uc1/run-1.json", OVERSIZED);
    git("add", "reports/uc1/run-1.json");

    expect(checkTokens("--staged")).toEqual({ status: 0, stderr: "" });
  });

  it("ignores staged deletions", () => {
    write("big.md", "# Small\n");
    git("add", "big.md");
    commit("x");
    unlinkSync(join(repo, "big.md"));
    git("add", "big.md");

    expect(checkTokens("--staged")).toEqual({ status: 0, stderr: "" });
  });
});

describe("check-tokens <paths>", () => {
  it("checks the named files in the working tree", () => {
    write("docs/big.md", OVERSIZED);
    write("small.ts", "export {};\n");

    expect(checkTokens("small.ts").status).toBe(0);
    const { status, stderr } = checkTokens("small.ts", "docs/big.md");
    expect(status).toBe(1);
    expect(stderr).toContain("docs/big.md: ~6,002 tokens");
  });

  it("matches exemptions against the repo root, wherever it is run from", () => {
    write("reports/uc1/run-1.json", OVERSIZED);
    write("docs/big.md", OVERSIZED);

    expect(checkTokensIn("docs", "../reports/uc1/run-1.json").status).toBe(0);
    expect(checkTokensIn("docs", "big.md").stderr).toContain("docs/big.md: ~6,002 tokens");
  });

  it.each([[[]], [["--staged", "a.md"]], [["--bogus"]]])(
    "explains its usage when the arguments are %j",
    (args) => {
      const { status, stderr } = checkTokens(...args);

      expect(status).toBe(2);
      expect(stderr).toBe("Usage: check-tokens --staged | check-tokens <path>...\n");
    },
  );
});
