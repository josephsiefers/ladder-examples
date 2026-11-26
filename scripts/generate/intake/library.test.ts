import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIBRARY } from "./intake.fixtures";
import { loadIntakeLibrary } from "./library";

let root: string;

describe("loadIntakeLibrary", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "intake-library-"));
    await mkdir(join(root, "kinds"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads each kind, named by its file, ignoring other files", async () => {
    await writeFile(join(root, "kinds", "msa.json"), JSON.stringify(LIBRARY.kinds.msa));
    await writeFile(join(root, "kinds", "notes.txt"), "not a kind");
    expect(await loadIntakeLibrary(root)).toEqual(LIBRARY);
  });

  it("names the file and the problem for a kind with a single variant", async () => {
    const kind = { ...LIBRARY.kinds.msa, titles: ["Master Services Agreement"] };
    await writeFile(join(root, "kinds", "msa.json"), JSON.stringify(kind));
    await expect(loadIntakeLibrary(root)).rejects.toThrow(
      "Invalid intake library file kinds/msa.json: titles: Too small: expected array to have >=2 items.",
    );
  });

  it("reads the committed library's MSA and SOW kinds", async () => {
    const { kinds } = await loadIntakeLibrary();
    expect(kinds.msa?.docType).toBe("msa");
    expect(kinds.sow?.docType).toBe("sow");
  });
});
