import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  findViolations,
  formatReport,
  isBinary,
  isExempt,
  TOKEN_LIMIT,
} from "./check-tokens";

const bytes = (text: string) => new TextEncoder().encode(text);
const file = (path: string, text: string) => ({ path, content: bytes(text) });

describe("estimateTokens", () => {
  it("is characters divided by four, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("x".repeat(20_000))).toBe(5_000);
  });
});

describe("isExempt", () => {
  it.each([
    "package-lock.json",
    "npm-shrinkwrap.json",
    "packages/app/package-lock.json",
    ".cache/llm/ab/cd.json",
    "out/firm/queues/litigation.json",
    "reports/uc1/run-1.json",
  ])("exempts %s", (path) => {
    expect(isExempt(path)).toBe(true);
  });

  it.each([
    "src/cli.ts",
    "docs/spec/README.md",
    "data/firm/contracts/a.json",
    "src/out/notes.md",
    "outline.md",
    ".cache/other/x.json",
    "packages/package-lock.json.md",
  ])("checks %s", (path) => {
    expect(isExempt(path)).toBe(false);
  });
});

describe("isBinary", () => {
  it("treats text, including non-ASCII text, as not binary", () => {
    expect(isBinary(bytes("# Heading\n\nCafé — ÷ ✓\n"))).toBe(false);
    expect(isBinary(new Uint8Array())).toBe(false);
  });

  it("treats content with a NUL byte near the start as binary", () => {
    expect(isBinary(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]))).toBe(true);
  });

  it("only sniffs the first 8,000 bytes, as git does", () => {
    const lateNul = new Uint8Array(8_001).fill(0x61);
    lateNul[8_000] = 0;
    expect(isBinary(lateNul)).toBe(false);
    lateNul[7_999] = 0;
    expect(isBinary(lateNul)).toBe(true);
  });
});

describe("findViolations", () => {
  it("flags only files over the limit, with their estimate", () => {
    expect(TOKEN_LIMIT).toBe(5_000);
    const violations = findViolations([
      file("at-limit.md", "x".repeat(20_000)),
      file("over-limit.md", "x".repeat(20_001)),
      file("small.ts", "export {};\n"),
    ]);
    expect(violations).toEqual([{ path: "over-limit.md", tokens: 5_001 }]);
  });

  it("skips exempt paths and binary content however large", () => {
    const huge = "x".repeat(40_000);
    const png = new Uint8Array(40_000);
    expect(
      findViolations([
        file("package-lock.json", huge),
        file("reports/uc1/run.json", huge),
        { path: "docs/diagram.png", content: png },
      ]),
    ).toEqual([]);
  });

  it("counts characters, not bytes", () => {
    expect(findViolations([file("accents.md", "é".repeat(20_000))])).toEqual([]);
  });
});

describe("formatReport", () => {
  it("lists each file with its estimate and the limit, then the full splitting advice", () => {
    const report = formatReport([
      { path: "big.md", tokens: 6_002 },
      { path: "src/core/llm/cache.ts", tokens: 12_345 },
    ]);
    expect(
      report,
    ).toBe(`Token-size check failed: 2 files are over the limit of 5,000 tokens (estimated as characters ÷ 4).

big.md: ~6,002 tokens (limit 5,000)
src/core/llm/cache.ts: ~12,345 tokens (limit 5,000)

Split each file before you commit. Do not delete code or squash it onto fewer
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
`);
  });

  it("uses the singular for one file", () => {
    expect(formatReport([{ path: "a.json", tokens: 5_001 }])).toMatch(
      /^Token-size check failed: 1 file is over the limit/,
    );
  });
});
