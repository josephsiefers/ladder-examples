import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DOC_TYPES } from "../../../src/core/documents";
import { readJson } from "../json";

/**
 * The intake library: the short-document kinds intake documents are assembled from, and the
 * hybrid ingredients added to them.
 */
const LIBRARY_ROOT = fileURLToPath(new URL("../../../data/library/intake/", import.meta.url));

/** Paragraphs with `{{placeholders}}`: `first`, `firstShort`, `second`, `secondShort`. */
const template = z.array(z.string().min(1)).min(1);

/** At least two of each, so the seed has a real choice. */
const variants = <T extends z.ZodType>(item: T) => z.array(item).min(2);

const kindSchema = z.object({
  docType: z.enum(DOC_TYPES),
  titles: variants(z.string().min(1)),
  /** The heading of section 1, which holds the opening. */
  openingHeading: z.string().min(1),
  /** The paragraphs that state the document's primary purpose; gold cites them as evidence. */
  openings: variants(template),
  /**
   * Each section's variants, in reading order: no section relies on something only a later one
   * introduces. The seed picks one variant each; the order never changes.
   */
  sections: z.array(z.object({ heading: z.string().min(1), variants: variants(template) })).min(2),
});

/** One kind of short document, e.g. an MSA. */
export type Kind = z.infer<typeof kindSchema>;

const ingredientSchema = z.object({
  /** The document type whose substance the ingredient is, e.g. `nda` for a confidentiality section. */
  docType: z.enum(DOC_TYPES),
  heading: z.string().min(1),
  /**
   * Where it goes: a `section` before the base document's closing section (its general terms,
   * signatures or acceptance), a `schedule` after every section.
   */
  placement: z.enum(["section", "schedule"]),
  variants: variants(template),
});

/** One hybrid ingredient: a numbered section of another document type's substance. */
export type Ingredient = z.infer<typeof ingredientSchema>;

export interface IntakeLibrary {
  kinds: Record<string, Kind>;
  ingredients: Record<string, Ingredient>;
}

/** Every `<name>.json` in `root/<dir>`, by name. */
async function readEntries<T>(
  root: string,
  dir: string,
  schema: z.ZodType<T>,
): Promise<Record<string, T>> {
  const files = (await readdir(join(root, dir)))
    .filter((file) => file.endsWith(".json"))
    .toSorted();
  const entries = await Promise.all(
    files.map(async (file) => {
      const entry = await readJson(
        join(root, dir, file),
        schema,
        `intake library file ${dir}/${file}`,
      );
      return [file.replace(/\.json$/, ""), entry] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Reads the intake library from `root`: one `kinds/<kind>.json` per kind, and one
 * `ingredients/<ingredient>.json` per ingredient.
 */
export async function loadIntakeLibrary(root: string = LIBRARY_ROOT): Promise<IntakeLibrary> {
  const [kinds, ingredients] = await Promise.all([
    readEntries(root, "kinds", kindSchema),
    readEntries(root, "ingredients", ingredientSchema),
  ]);
  return { kinds, ingredients };
}
