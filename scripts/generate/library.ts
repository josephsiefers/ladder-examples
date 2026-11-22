import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** The clause-variant library: generator input, kept apart from the fake firm's data. */
const LIBRARY_ROOT = fileURLToPath(new URL("../../data/library/nda/", import.meta.url));

/**
 * The 15 NDA clause types of the UC3 playbook, plus `general` boilerplate, in the order the
 * library is read. Each has its own file under `clauses/`.
 */
export const CLAUSE_TYPES = [
  "confidential-information",
  "exclusions",
  "permitted-purpose",
  "representatives",
  "compelled-disclosure",
  "standard-of-care",
  "term-and-survival",
  "return-or-destruction",
  "no-licence",
  "no-warranty",
  "remedies",
  "indemnity",
  "limitation-of-liability",
  "non-solicitation",
  "governing-law-and-jurisdiction",
  "general",
] as const;

export type ClauseType = (typeof CLAUSE_TYPES)[number];

/** Standard variants are named `standard-…`; UC3 adds deviation variants under other names. */
export const STANDARD_VARIANT = /^standard-/;

const clauseVariant = z.object({
  heading: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1),
});

export type ClauseVariant = z.infer<typeof clauseVariant>;

/** One wording of a metadata phrasing: its paragraphs, with `{{placeholders}}`. */
const template = z.array(z.string().min(1)).min(1);

export type Template = z.infer<typeof template>;

const wordings = z.array(template).min(1);

const phrasingsSchema = z.object({
  parties: z.object({ standard: wordings }),
  effectiveDate: z.object({ numerals: wordings, words: wordings, "last-signature": wordings }),
  mutuality: z.object({
    mutual: wordings,
    "one-way": wordings,
    "one-way-mutual-discussions": wordings,
  }),
  term: z.object({ fixed: wordings, "until-terminated": wordings }),
  survivalPeriod: z.object({
    fixed: wordings,
    "like-term": wordings,
    "trade-secrets-indefinite": wordings,
    indefinite: wordings,
  }),
  governingLaw: z.object({ standard: wordings }),
  signature: z.object({ standard: wordings }),
});

const metadataSchema = z.object({
  titles: z.object({
    mutual: z.array(z.string().min(1)).min(1),
    "one-way": z.array(z.string().min(1)).min(1),
  }),
  phrasings: phrasingsSchema.refine(
    ({ term, survivalPeriod }) => term.fixed.length === survivalPeriod["like-term"].length,
    {
      message: "survivalPeriod.like-term needs one wording per term.fixed wording, mirroring it",
      path: ["survivalPeriod", "like-term"],
    },
  ),
});

export type Phrasings = z.infer<typeof phrasingsSchema>;

export interface Library {
  /** Per clause type, its variants by name. */
  clauses: Record<ClauseType, Record<string, ClauseVariant>>;
  titles: { mutual: string[]; "one-way": string[] };
  /** Metadata phrasings: per field, per phrasing name, one or more wordings. */
  phrasings: Phrasings;
}

async function readJson<T>(path: string, schema: z.ZodType<T>, label: string): Promise<T> {
  const parsed = schema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid library file ${label}: ${issues.join("; ")}.`);
  }
  return parsed.data;
}

/** Reads the library from `root`: `metadata.json` and one `clauses/<clause-type>.json` per clause type. */
export async function loadLibrary(root: string = LIBRARY_ROOT): Promise<Library> {
  const clauseFiles = new Set(await readdir(join(root, "clauses")));
  const extra = [...clauseFiles].filter(
    (file) => !(CLAUSE_TYPES as readonly string[]).includes(file.replace(/\.json$/, "")),
  );
  if (extra.length > 0)
    throw new Error(`Unknown clause types in the library: ${extra.join(", ")}.`);
  const variantsSchema = z
    .record(z.string(), clauseVariant)
    .refine((variants) => Object.keys(variants).some((name) => STANDARD_VARIANT.test(name)), {
      message: "needs at least one standard-… variant",
    });
  const entries = await Promise.all(
    CLAUSE_TYPES.map(async (type) => {
      const file = `clauses/${type}.json`;
      return [type, await readJson(join(root, file), variantsSchema, file)] as const;
    }),
  );
  const metadata = await readJson(join(root, "metadata.json"), metadataSchema, "metadata.json");
  return {
    clauses: Object.fromEntries(entries) as Library["clauses"],
    ...metadata,
  };
}
