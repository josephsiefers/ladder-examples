import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Corpus, runCorpus } from "./run-corpus";

interface ToySpec {
  id: string;
  split: "dev" | "test";
  plants: string[];
}

const SPECS: ToySpec[] = [
  { id: "a", split: "dev", plants: ["p"] },
  { id: "b", split: "dev", plants: ["p"] },
  { id: "c", split: "test", plants: ["p"] },
];

function toyCorpus(specs: ToySpec[], seen: { plantsDir?: string } = {}): Corpus<ToySpec> {
  return {
    noun: "toys",
    coverage: { plants: ["p"], plantsOf: (spec) => spec.plants, minimums: { dev: 2, test: 1 } },
    async load({ plantsDir }) {
      seen.plantsDir = plantsDir;
      return {
        specs,
        filesOf: (spec) => [
          { path: join("data/toys", spec.split, `${spec.id}.txt`), content: `toy ${spec.id}\n` },
        ],
      };
    },
  };
}

let outRoot: string;
let stdout: string[];
let stderr: string[];

async function run(corpus: Corpus<ToySpec>, plantsDir?: string) {
  stdout = [];
  stderr = [];
  return runCorpus(corpus, {
    outRoot,
    plantsDir,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });
}

describe("runCorpus", () => {
  beforeEach(async () => {
    outRoot = await mkdtemp(join(tmpdir(), "run-corpus-"));
  });
  afterEach(async () => {
    await rm(outRoot, { recursive: true, force: true });
  });

  it("prints the coverage table, writes each file under the output root, and sums up", async () => {
    expect(await run(toyCorpus(SPECS))).toBe(0);
    expect(stdout).toEqual([
      [
        "| Plant | Dev (min 2) | Test (min 1) | |",
        "|---|---:|---:|---|",
        "| p | 2 | 1 | ok |",
      ].join("\n"),
      "\nWrote 3 toys (2 dev, 1 test) and their gold cases.",
    ]);
    expect(stderr).toEqual([]);
    expect(await readFile(join(outRoot, "data/toys/test/c.txt"), "utf8")).toBe("toy c\n");
    expect(await readdir(join(outRoot, "data/toys/dev"))).toEqual(["a.txt", "b.txt"]);
  });

  it("passes the plant spec directory to the corpus", async () => {
    const seen: { plantsDir?: string } = {};
    await run(toyCorpus(SPECS, seen), "/plants");
    expect(seen.plantsDir).toBe("/plants");
  });

  it("fails with the shortfall, writing nothing, when coverage minimums are not met", async () => {
    expect(await run(toyCorpus(SPECS.slice(0, 2)))).toBe(1);
    expect(stdout).toEqual([expect.stringContaining("| p | 2 | 0 | SHORT |")]);
    expect(stderr).toEqual([
      "error: coverage minimums not met (2 in dev, 1 in test) for 1 plant(s); add or change plant specs.",
    ]);
    expect(await readdir(outRoot)).toEqual([]);
  });
});
