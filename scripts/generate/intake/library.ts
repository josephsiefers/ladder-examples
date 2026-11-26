import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DOC_TYPES } from "../../../src/core/documents";
import { readJson } from "../json";

/** The intake library: the short-document kinds intake documents are assembled from. */
const LIBRARY_ROOT = fileURLToPath(new URL("../../../data/library/intake/", import.meta.url));

/** Paragraphs with `{{placeholders}}`: `first`, `firstShort`, `second`, `secondShort`. */
const template = z.array(z.string().min(1)).min(1);

export type Template = z.infer<typeof template>;

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

export interface IntakeLibrary {
  kinds: Record<string, Kind>;
}

/** Reads the intake library from `root`: one `kinds/<kind>.json` per kind. */
export async function loadIntakeLibrary(root: string = LIBRARY_ROOT): Promise<IntakeLibrary> {
  const dir = join(root, "kinds");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).toSorted();
  const kinds = await Promise.all(
    files.map(async (file) => {
      const kind = await readJson(join(dir, file), kindSchema, `intake library file kinds/${file}`);
      return [file.replace(/\.json$/, ""), kind] as const;
    }),
  );
  return { kinds: Object.fromEntries(kinds) };
}
