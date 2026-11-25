import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DOC_TYPES } from "./spec";

/** The intake library: short-document building blocks and hybrid ingredients. */
const LIBRARY_ROOT = fileURLToPath(new URL("../../../data/library/intake/", import.meta.url));

/** Paragraphs with `{{placeholders}}`: `first`, `firstShort`, `second`, `secondShort`. */
const template = z.array(z.string().min(1)).min(1);

export type Template = z.infer<typeof template>;

/** At least two of each, so the seed has a real choice. */
const variants = <T extends z.ZodType>(item: T) => z.array(item).min(2);

const letterParts = z.object({
  /** The unnumbered line before the letter's numbered paragraphs, e.g. "Dear {{secondShort}},". */
  salutation: z.string().min(1),
  /** The unnumbered lines after them. */
  signoff: z.string().min(1),
});

export type LetterParts = z.infer<typeof letterParts>;

const kindSchema = z.object({
  docType: z.enum(DOC_TYPES),
  titles: variants(z.string().min(1)),
  /** The paragraphs that state the document's primary purpose; gold cites them as evidence. */
  openings: variants(template),
  /** Each section's variants; the seed picks one each and shuffles the sections' order. */
  sections: z.array(z.object({ heading: z.string().min(1), variants: variants(template) })).min(2),
  /** A letter numbers its paragraphs `1.`, `2.`, … without headings; absent for a clause-numbered document. */
  letter: letterParts.optional(),
});

/** One kind of short document, e.g. an MSA or a lease. */
export type Kind = z.infer<typeof kindSchema>;

const ingredientSchema = z.discriminatedUnion("kind", [
  z.object({
    docType: z.enum(DOC_TYPES),
    kind: z.literal("section"),
    /** `body` goes at a seeded place after the opening; `end` goes last, e.g. a schedule. */
    placement: z.enum(["body", "end"]),
    heading: z.string().min(1),
    paragraphs: template,
  }),
  /** Replaces the base document's title. */
  z.object({
    docType: z.enum(DOC_TYPES),
    kind: z.literal("title"),
    titles: z.array(z.string().min(1)).min(1),
  }),
  /** Recasts the base document as a letter: a new title, a salutation and a sign-off. */
  z.object({
    docType: z.enum(DOC_TYPES),
    kind: z.literal("letter"),
    titles: z.array(z.string().min(1)).min(1),
    ...letterParts.shape,
  }),
]);

/** Something added to a base document that belongs to another document type. */
export type Ingredient = z.infer<typeof ingredientSchema>;

export interface IntakeLibrary {
  kinds: Record<string, Kind>;
  ingredients: Record<string, Ingredient>;
}

async function readJson<T>(path: string, schema: z.ZodType<T>, label: string): Promise<T> {
  const parsed = schema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid intake library file ${label}: ${issues.join("; ")}.`);
  }
  return parsed.data;
}

/** Reads the intake library from `root`: one `kinds/<kind>.json` per kind, and `ingredients.json`. */
export async function loadIntakeLibrary(root: string = LIBRARY_ROOT): Promise<IntakeLibrary> {
  const files = (await readdir(join(root, "kinds")))
    .filter((file) => file.endsWith(".json"))
    .toSorted();
  const kinds = await Promise.all(
    files.map(async (file) => {
      const kind = await readJson(join(root, "kinds", file), kindSchema, `kinds/${file}`);
      return [file.replace(/\.json$/, ""), kind] as const;
    }),
  );
  const ingredients = await readJson(
    join(root, "ingredients.json"),
    z.record(z.string(), ingredientSchema),
    "ingredients.json",
  );
  return { kinds: Object.fromEntries(kinds), ingredients };
}
