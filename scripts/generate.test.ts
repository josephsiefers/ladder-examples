import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGenerate } from "./generate";
import { WORKED_SPEC } from "./generate/generate.fixtures";

const REPO = fileURLToPath(new URL("../", import.meta.url));

let outRoot: string;
let output: string[];

async function generate(argv: string[], options: { plantsDir?: string } = {}) {
  output = [];
  const status = await runGenerate(argv, {
    outRoot,
    ...options,
    stdout: (text) => output.push(text),
    stderr: (text) => output.push(text),
  });
  return status;
}

/** Every file under `dir`, relative to it, with its content. */
async function tree(dir: string): Promise<Record<string, string>> {
  const files = await readdir(dir, { recursive: true, withFileTypes: true });
  const entries = await Promise.all(
    files
      .filter((file) => file.isFile())
      .map(async (file) => {
        const path = join(file.parentPath, file.name);
        return [path.slice(dir.length + 1), await readFile(path, "utf8")] as const;
      }),
  );
  return Object.fromEntries(entries.toSorted(([a], [b]) => a.localeCompare(b)));
}

describe("npm run generate -- ndas", () => {
  beforeEach(async () => {
    outRoot = await mkdtemp(join(tmpdir(), "generate-"));
  });
  afterEach(async () => {
    await rm(outRoot, { recursive: true, force: true });
  });

  it("writes every NDA and its gold case, byte-identical to the committed files", async () => {
    expect(await generate(["ndas"])).toBe(0);
    const written = await tree(outRoot);
    const paths = Object.keys(written);
    expect(paths.filter((path) => path.startsWith("data/firm/contracts/"))).toHaveLength(20);
    expect(paths.filter((path) => path.startsWith("data/evals/snapshot/dev/"))).toHaveLength(12);
    expect(paths.filter((path) => path.startsWith("data/evals/snapshot/test/"))).toHaveLength(8);
    expect(paths).toHaveLength(40);
    const committed = Object.fromEntries(
      await Promise.all(
        paths.map(async (path) => [path, await readFile(join(REPO, path), "utf8")]),
      ),
    );
    expect(written).toEqual(committed);
  });

  it("writes the same bytes on a second run", async () => {
    await generate(["ndas"]);
    const first = await tree(outRoot);
    await generate(["ndas"]);
    expect(await tree(outRoot)).toEqual(first);
  });

  it("prints the coverage table and what it wrote", async () => {
    await generate(["ndas"]);
    const printed = output.join("\n");
    expect(printed).toContain("| effective date in words | 3 | 2 | ok |");
    expect(printed).toContain("| governing law ≠ courts | 5 | 2 | ok |");
    expect(printed).toContain("Wrote 20 NDAs (12 dev, 8 test)");
  });

  it("fails, writing nothing, when a plant falls short of its coverage minimum", async () => {
    const plantsDir = join(outRoot, "plants");
    await mkdir(plantsDir);
    await writeFile(join(plantsDir, "nda-worked.json"), JSON.stringify(WORKED_SPEC));
    expect(await generate(["ndas"], { plantsDir })).toBe(1);
    expect(output.join("\n")).toContain("| term until terminated on notice | 0 | 0 | SHORT |");
    expect(output.at(-1)).toBe(
      "error: coverage minimums not met (2 in dev, 1 in test) for 13 plant(s); add or change plant specs.",
    );
    expect(Object.keys(await tree(outRoot))).toEqual(["plants/nda-worked.json"]);
  });

  it.each([[[]], [["contracts"]], [["ndas", "extra"]]])(
    "rejects arguments %j with usage",
    async (argv) => {
      expect(await generate(argv)).toBe(2);
      expect(output).toEqual(["usage: npm run generate -- ndas | intake"]);
    },
  );
});
