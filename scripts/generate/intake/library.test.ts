import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIBRARY } from "./intake.fixtures";
import { loadIntakeLibrary } from "./library";

let root: string;

/** Words in a variant's paragraphs, as an associate reads them. */
const words = (paragraphs: readonly string[]) =>
  paragraphs.flatMap((text) => text.split(/\s+/)).length;

describe("loadIntakeLibrary", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "intake-library-"));
    await mkdir(join(root, "kinds"));
    await mkdir(join(root, "ingredients"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads each kind and ingredient, named by its file, ignoring other files", async () => {
    await writeFile(join(root, "kinds", "msa.json"), JSON.stringify(LIBRARY.kinds.msa));
    await writeFile(join(root, "kinds", "notes.txt"), "not a kind");
    for (const [name, ingredient] of Object.entries(LIBRARY.ingredients)) {
      await writeFile(join(root, "ingredients", `${name}.json`), JSON.stringify(ingredient));
    }
    await writeFile(join(root, "ingredients", "notes.txt"), "not an ingredient");
    expect(await loadIntakeLibrary(root)).toEqual(LIBRARY);
  });

  it("names the file and the problem for an ingredient with a single variant", async () => {
    const ingredient = { ...LIBRARY.ingredients.secrecy, variants: [["Only one."]] };
    await writeFile(join(root, "ingredients", "secrecy.json"), JSON.stringify(ingredient));
    await expect(loadIntakeLibrary(root)).rejects.toThrow(
      "Invalid intake library file ingredients/secrecy.json: variants: Too small: expected array to have >=2 items.",
    );
  });

  it("reads the committed ingredients, each with the document type of its substance", async () => {
    const { ingredients } = await loadIntakeLibrary();
    const types = Object.fromEntries(
      Object.entries(ingredients).map(([name, { docType, placement }]) => [
        name,
        `${docType} ${placement}`,
      ]),
    );
    expect(types).toEqual({
      "confidentiality-section": "nda section",
      "dpa-schedule": "dpa schedule",
      "ip-section": "msa section",
      "non-solicitation-section": "other section",
    });
  });

  it("names the file and the problem for a kind with a single variant", async () => {
    const kind = { ...LIBRARY.kinds.msa, titles: ["Master Services Agreement"] };
    await writeFile(join(root, "kinds", "msa.json"), JSON.stringify(kind));
    await expect(loadIntakeLibrary(root)).rejects.toThrow(
      "Invalid intake library file kinds/msa.json: titles: Too small: expected array to have >=2 items.",
    );
  });

  it("reads the committed library's kinds, each with the document type of its purpose", async () => {
    const { kinds } = await loadIntakeLibrary();
    const types = Object.fromEntries(
      Object.entries(kinds).map(([name, { docType }]) => [name, docType]),
    );
    expect(types).toEqual({
      // A confidentiality letter is an NDA in letter form: the form changes, not the purpose.
      "confidentiality-letter": "nda",
      dpa: "dpa",
      employment: "other",
      "engagement-letter": "other",
      lease: "other",
      msa: "msa",
      "settlement-letter": "other",
      "software-licence": "other",
      sow: "sow",
    });
  });

  it("keeps every committed kind to 1–2 pages, whichever variants the seed picks", async () => {
    // The corpus test counts the documents the specs build; this bounds every other seed too.
    const { kinds } = await loadIntakeLibrary();
    for (const [name, { openings, sections }] of Object.entries(kinds)) {
      const choices = [openings, ...sections.map(({ variants }) => variants)].map((options) =>
        options.map(words),
      );
      const fewest = choices.reduce((sum, counts) => sum + Math.min(...counts), 0);
      const most = choices.reduce((sum, counts) => sum + Math.max(...counts), 0);
      expect({ name, inRange: fewest >= 400 && most <= 900 }).toEqual({ name, inRange: true });
    }
  });

  it("names, in the committed openings, only titles that every title of the kind shares", async () => {
    // The seed picks the title and the opening independently, so an opening may name only what
    // every title shares: an MSA titled "Framework Services Agreement" must not open "This Master
    // Services Agreement".
    const { kinds } = await loadIntakeLibrary();
    for (const [name, { titles, openings }] of Object.entries(kinds)) {
      const named = openings
        .flat()
        .flatMap((text) => titles.filter((title) => text.includes(title)));
      const unshared = named.filter((title) => !titles.every((other) => other.includes(title)));
      expect({ name, unshared }).toEqual({ name, unshared: [] });
    }
  });
});
