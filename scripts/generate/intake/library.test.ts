import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLEAN_MSA } from "./intake.fixtures";
import { loadIntakeLibrary } from "./library";
import { intakePlantSpecSchema } from "./spec";

const LIBRARY = fileURLToPath(new URL("../../../data/library/intake/", import.meta.url));

let root: string;

describe("loadIntakeLibrary", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "intake-library-"));
    await cp(LIBRARY, root, { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads every kind by file name, ignoring other files, and every ingredient", async () => {
    await writeFile(join(root, "kinds", "notes.txt"), "not a kind");
    const library = await loadIntakeLibrary(root);
    expect(Object.keys(library.kinds)).toEqual([
      "confidentiality-agreement",
      "dpa",
      "employment",
      "engagement-letter",
      "lease",
      "msa",
      "settlement-letter",
      "software-licence",
      "sow",
    ]);
    expect(library.kinds["engagement-letter"]?.letter?.salutation).toBe("Dear {{secondShort}},");
    expect(library.ingredients["data-sharing-title"]).toEqual({
      docType: "other",
      kind: "title",
      titles: ["Data Sharing Agreement"],
    });
  });

  it("names the file and the problem for a kind with only one title", async () => {
    const path = join(root, "kinds", "lease.json");
    const lease = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...lease, titles: ["Lease"] }));
    await expect(loadIntakeLibrary(root)).rejects.toThrow(
      "Invalid intake library file kinds/lease.json: titles: Too small: expected array to have >=2 items.",
    );
  });

  it("names the problem for an ingredient of an unknown document type", async () => {
    await writeFile(
      join(root, "ingredients.json"),
      JSON.stringify({ x: { docType: "lease", kind: "title", titles: ["X"] } }),
    );
    await expect(loadIntakeLibrary(root)).rejects.toThrow(
      /^Invalid intake library file ingredients\.json: x\.docType: /,
    );
  });
});

describe("intakePlantSpecSchema", () => {
  it("accepts a clean spec without ingredients and a hybrid with them", () => {
    expect(intakePlantSpecSchema.safeParse(CLEAN_MSA).success).toBe(true);
    const hybrid = { ...CLEAN_MSA, ambiguity: "hybrid", ingredients: ["x"] };
    expect(intakePlantSpecSchema.safeParse(hybrid).success).toBe(true);
  });

  it.each([
    ["a hybrid without ingredients", { ambiguity: "hybrid" }],
    ["a clean spec with ingredients", { ingredients: ["x"] }],
  ])("rejects %s", (_, change) => {
    const parsed = intakePlantSpecSchema.safeParse({ ...CLEAN_MSA, ...change });
    expect(parsed.error?.issues.map(({ path, message }) => [path, message])).toEqual([
      [["ingredients"], "a hybrid document needs ingredients, and a clean one has none"],
    ]);
  });
});
