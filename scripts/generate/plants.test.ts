import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MUTUAL_SPEC, WORKED_SPEC } from "./generate.fixtures";
import { loadPlantSpecs } from "./plants";

let dir: string;

describe("loadPlantSpecs", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "plants-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads every spec, sorted by ID, ignoring other files", async () => {
    await writeFile(join(dir, "nda-worked.json"), JSON.stringify(WORKED_SPEC));
    await writeFile(join(dir, "nda-mutual.json"), JSON.stringify(MUTUAL_SPEC));
    await writeFile(join(dir, "notes.txt"), "not a spec");
    expect(await loadPlantSpecs(dir)).toEqual([MUTUAL_SPEC, WORKED_SPEC]);
  });

  it("names the file and the problem for an invalid spec", async () => {
    await writeFile(join(dir, "nda-worked.json"), JSON.stringify({ ...WORKED_SPEC, seed: -1 }));
    await expect(loadPlantSpecs(dir)).rejects.toThrow(
      "Invalid plant spec nda-worked.json: seed: Too small: expected number to be >=0.",
    );
  });

  it("rejects a spec whose ID does not match its file name", async () => {
    await writeFile(join(dir, "nda-other.json"), JSON.stringify(WORKED_SPEC));
    await expect(loadPlantSpecs(dir)).rejects.toThrow(
      "Invalid plant spec nda-other.json: its id is 'nda-worked'.",
    );
  });
});
