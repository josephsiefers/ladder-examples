import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGenerate } from "./generate";
import { MSA_SPEC } from "./generate/intake/intake.fixtures";
import { tree } from "./generate/tree.fixtures";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const PLANTS = join(REPO, "data/evals/triage/plants");

let outRoot: string;
let output: string[];

async function generate(options: { plantsDir?: string } = {}) {
  output = [];
  return runGenerate(["intake"], {
    outRoot,
    ...options,
    stdout: (text) => output.push(text),
    stderr: (text) => output.push(text),
  });
}

describe("npm run generate -- intake", () => {
  beforeEach(async () => {
    outRoot = await mkdtemp(join(tmpdir(), "generate-intake-"));
  });
  afterEach(async () => {
    await rm(outRoot, { recursive: true, force: true });
  });

  it("writes each plant spec's intake document and gold case, byte-identical to the committed files", async () => {
    const specs = await Promise.all(
      (await readdir(PLANTS)).map(async (file) =>
        JSON.parse(await readFile(join(PLANTS, file), "utf8")),
      ),
    );
    expect(await generate()).toBe(0);
    const written = await tree(outRoot);

    const expected = specs.flatMap(({ id, split }) => [
      `data/firm/intake/${id}.md`,
      `data/evals/triage/${split}/${id}.json`,
    ]);
    expect(Object.keys(written).toSorted()).toEqual(expected.toSorted());
    const committed = Object.fromEntries(
      await Promise.all(
        expected.map(async (path) => [path, await readFile(join(REPO, path), "utf8")]),
      ),
    );
    expect(written).toEqual(committed);
  });

  it("writes the same bytes on a second run", async () => {
    await generate();
    const first = await tree(outRoot);
    await generate();
    expect(await tree(outRoot)).toEqual(first);
  });

  it("prints the coverage table by document type, split and ambiguity, and what it wrote", async () => {
    await generate();
    const printed = output.join("\n");
    expect(printed).toContain("| Type · ambiguity | Dev (min 2) | Test (min 1) | |");
    for (const row of [
      "nda · clean",
      "msa · clean",
      "dpa · clean",
      "sow · clean",
      "other · clean",
    ]) {
      expect(printed).toMatch(new RegExp(`\\| ${row} \\| \\d+ \\| \\d+ \\| ok \\|`));
    }
    expect(output.at(-1)).toMatch(
      /^\nWrote \d+ intake documents \(\d+ dev, \d+ test\) and their gold cases\.$/,
    );
  });

  it("refuses, writing nothing, a plant spec whose type is not its base document's", async () => {
    const plantsDir = join(outRoot, "plants");
    await cp(PLANTS, plantsDir, { recursive: true });
    const wrong = { ...MSA_SPEC, id: "intake-wrong", docType: "dpa" };
    await writeFile(join(plantsDir, "intake-wrong.json"), JSON.stringify(wrong));

    expect(await generate({ plantsDir })).toBe(1);
    expect(output.at(-1)).toBe(
      "error: intake-wrong: its document type is dpa, but its base document is a msa.",
    );
    expect(Object.keys(await tree(outRoot)).every((path) => path.startsWith("plants/"))).toBe(true);
  });
});
