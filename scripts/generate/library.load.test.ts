import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLibrary } from "./library";

const LIBRARY = fileURLToPath(new URL("../../data/library/nda/", import.meta.url));

let root: string;

async function editJson(file: string, change: (data: Record<string, any>) => void) {
  const path = join(root, file);
  const data = JSON.parse(await readFile(path, "utf8"));
  change(data);
  await writeFile(path, JSON.stringify(data));
}

describe("loadLibrary", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "library-"));
    await cp(LIBRARY, root, { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads every clause type's variants and the metadata phrasings", async () => {
    const library = await loadLibrary(root);
    expect(Object.keys(library.clauses.indemnity)).toEqual([
      "standard-breach",
      "standard-third-party",
    ]);
    expect(library.titles.mutual).toContain("Mutual Non-Disclosure Agreement");
    expect(library.phrasings.term["until-terminated"]).toHaveLength(2);
  });

  it("rejects a clause file for a clause type it does not know", async () => {
    await writeFile(join(root, "clauses", "arbitration.json"), "{}");
    await expect(loadLibrary(root)).rejects.toThrow(
      "Unknown clause types in the library: arbitration.json.",
    );
  });

  it("rejects a clause type with no standard variant", async () => {
    await editJson("clauses/indemnity.json", (data) => {
      data["deviation-uncapped"] = data["standard-breach"];
      delete data["standard-breach"];
      delete data["standard-third-party"];
    });
    await expect(loadLibrary(root)).rejects.toThrow(
      "Invalid library file clauses/indemnity.json: : needs at least one standard-… variant.",
    );
  });

  it("names the file and field of a malformed variant", async () => {
    await editJson("clauses/remedies.json", (data) => {
      data["standard-injunction"].paragraphs = [];
    });
    await expect(loadLibrary(root)).rejects.toThrow(
      "Invalid library file clauses/remedies.json: standard-injunction.paragraphs: Too small",
    );
  });

  it("needs one like-term survival wording to mirror each fixed term wording", async () => {
    await editJson("metadata.json", (data) => {
      data.phrasings.survivalPeriod["like-term"].pop();
    });
    await expect(loadLibrary(root)).rejects.toThrow(
      "Invalid library file metadata.json: phrasings.survivalPeriod.like-term: survivalPeriod.like-term needs one wording per term.fixed wording, mirroring it.",
    );
  });
});
