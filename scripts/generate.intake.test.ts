import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGenerate } from "./generate";
import { CLEAN_MSA } from "./generate/intake/intake.fixtures";
import { loadIntakeLibrary } from "./generate/intake/library";
import { intakePlantSpecSchema } from "./generate/intake/spec";
import { loadSpecs } from "./generate/plants";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const PLANTS = join(REPO, "data/evals/triage/plants");

let outRoot: string;
let output: string[];

async function generate(argv: string[], options: { plantsDir?: string } = {}) {
  output = [];
  return runGenerate(argv, {
    outRoot,
    ...options,
    stdout: (text) => output.push(text),
    stderr: (text) => output.push(text),
  });
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

describe("npm run generate -- intake", () => {
  beforeEach(async () => {
    outRoot = await mkdtemp(join(tmpdir(), "generate-intake-"));
  });
  afterEach(async () => {
    await rm(outRoot, { recursive: true, force: true });
  });

  it("writes every intake document and its gold case, byte-identical to the committed files", async () => {
    expect(await generate(["intake"])).toBe(0);
    const written = await tree(outRoot);
    const paths = Object.keys(written);
    expect(paths.filter((path) => path.startsWith("data/firm/intake/"))).toHaveLength(30);
    expect(paths.filter((path) => path.startsWith("data/evals/triage/dev/"))).toHaveLength(18);
    expect(paths.filter((path) => path.startsWith("data/evals/triage/test/"))).toHaveLength(12);
    const committed = Object.fromEntries(
      await Promise.all(
        paths.map(async (path) => [path, await readFile(join(REPO, path), "utf8")]),
      ),
    );
    expect(written).toEqual(committed);
  });

  it("writes the same bytes on a second run", async () => {
    await generate(["intake"]);
    const first = await tree(outRoot);
    await generate(["intake"]);
    expect(await tree(outRoot)).toEqual(first);
  });

  it("prints the coverage table and what it wrote", async () => {
    await generate(["intake"]);
    const printed = output.join("\n");
    expect(printed).toContain("| Type | Dev clean | Dev hybrid | Test clean | Test hybrid |");
    expect(printed).toContain("| **total** | 14 | 4 | 9 | 3 |");
    expect(printed).toContain(
      "Wrote 30 intake documents (18 dev, 12 test, 7 hybrid) and their gold cases.",
    );
  });

  it("fails, writing nothing, when coverage falls short", async () => {
    const plantsDir = join(outRoot, "plants");
    await mkdir(plantsDir);
    await writeFile(join(plantsDir, `${CLEAN_MSA.id}.json`), JSON.stringify(CLEAN_MSA));
    expect(await generate(["intake"], { plantsDir })).toBe(1);
    expect(output.at(-1)).toMatch(
      /^error: intake coverage not met: fewer than 6 hybrids \(0\); no hybrid in dev; .*; add or change plant specs\.$/,
    );
    expect(Object.keys(await tree(outRoot))).toEqual([`plants/${CLEAN_MSA.id}.json`]);
  });

  it("rejects an unknown corpus with usage", async () => {
    expect(await generate(["contracts"])).toBe(2);
    expect(output).toEqual(["usage: npm run generate -- ndas | intake"]);
  });
});

describe("the committed intake plant specs", () => {
  it("cover the types the UC2 spec asks for, with hybrids in both splits", async () => {
    const specs = await loadSpecs(PLANTS, intakePlantSpecSchema);
    const count = (filter: (spec: (typeof specs)[number]) => boolean) =>
      specs.filter(filter).length;
    expect(specs).toHaveLength(30);
    expect(count((spec) => spec.split === "dev")).toBe(18);
    expect(
      Object.fromEntries(
        ["nda", "msa", "dpa", "sow", "other"].map((type) => [
          type,
          count((s) => s.docType === type),
        ]),
      ),
    ).toEqual({ nda: 10, msa: 5, dpa: 4, sow: 4, other: 7 });
    expect(count((spec) => spec.ambiguity === "hybrid")).toBeGreaterThanOrEqual(6);
    for (const split of ["dev", "test"]) {
      expect(count((spec) => spec.split === split && spec.ambiguity === "hybrid")).toBeGreaterThan(
        0,
      );
    }
    const hybridTypes = new Set(
      specs.filter((s) => s.ambiguity === "hybrid").map((s) => s.docType),
    );
    expect(hybridTypes.size).toBeGreaterThanOrEqual(4);
  });

  it("give each hybrid an ingredient of another type, and each document its base's type", async () => {
    const [specs, library] = await Promise.all([
      loadSpecs(PLANTS, intakePlantSpecSchema),
      loadIntakeLibrary(),
    ]);
    const problems = specs.flatMap((spec) => {
      const baseType =
        spec.base.kind === "nda-copy" ? "nda" : library.kinds[spec.base.name]?.docType;
      const types = spec.ingredients.map((name) => library.ingredients[name]?.docType);
      const otherType = types.some((type) => type !== undefined && type !== spec.docType);
      return [
        ...(baseType === spec.docType ? [] : [`${spec.id}: base is a ${baseType}`]),
        ...(otherType === (spec.ambiguity === "hybrid") ? [] : [`${spec.id}: ingredients`]),
      ];
    });
    expect(problems).toEqual([]);
  });

  it("copy each clean NDA byte for byte from the firm's contracts", async () => {
    const copies = (await loadSpecs(PLANTS, intakePlantSpecSchema)).flatMap((spec) =>
      spec.base.kind === "nda-copy" && spec.ingredients.length === 0
        ? [{ id: spec.id, source: spec.base.contractId }]
        : [],
    );
    expect(copies.length).toBeGreaterThanOrEqual(8);
    const differing = [];
    for (const { id, source } of copies) {
      const [copy, original] = await Promise.all([
        readFile(join(REPO, "data/firm/intake", `${id}.md`)),
        readFile(join(REPO, "data/firm/contracts", `${source}.md`)),
      ]);
      if (!copy.equals(original)) differing.push(id);
    }
    expect(differing).toEqual([]);
  });
});
