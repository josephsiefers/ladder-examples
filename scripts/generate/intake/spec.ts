import { z } from "zod";

/** The document types, by primary purpose; the same names as UC2's classification. */
export const DOC_TYPES = ["nda", "msa", "dpa", "sow", "other"] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const AMBIGUITIES = ["clean", "hybrid"] as const;

export type Ambiguity = (typeof AMBIGUITIES)[number];

const party = z.object({
  /** The legal entity. */
  name: z.string().min(1),
  /** The defined short name, e.g. "Corvane". */
  short: z.string().min(1),
});

/**
 * One generated intake document: its split and seed, its answer key (document type and
 * ambiguity), the base document it starts from, and the hybrid ingredients added to it.
 */
export const intakePlantSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    split: z.enum(["dev", "test"]),
    /** Seeds the choice of title, opening and section variants, section order and placement. */
    seed: z.number().int().nonnegative(),
    docType: z.enum(DOC_TYPES),
    ambiguity: z.enum(AMBIGUITIES),
    base: z.discriminatedUnion("kind", [
      /** A UC1 NDA from the firm's contracts, copied byte for byte unless ingredients are added. */
      z.object({ kind: z.literal("nda-copy"), contractId: z.string().min(1) }),
      /** A short document assembled from one kind in the intake library, e.g. `msa` or `lease`. */
      z.object({
        kind: z.literal("library"),
        name: z.string().min(1),
        parties: z.tuple([party, party]),
      }),
    ]),
    /** Hybrid ingredients from the intake library, in the order they are added. */
    ingredients: z.array(z.string().min(1)),
  })
  .superRefine((spec, context) => {
    const hybrid = spec.ingredients.length > 0;
    if (hybrid !== (spec.ambiguity === "hybrid")) {
      context.addIssue({
        code: "custom",
        path: ["ingredients"],
        message: "a hybrid document needs ingredients, and a clean one has none",
      });
    }
  });

export type IntakePlantSpec = z.infer<typeof intakePlantSpecSchema>;

/** A gold case file, as `data/evals/triage/<split>/<id>.json` holds it. */
export interface IntakeGoldCase {
  input: { documentId: string };
  gold: { docType: DocType; ambiguity: Ambiguity };
  /** `title` stands for the document's title; the rest are the paragraphs that show primary purpose. */
  evidence: { docType: string[] };
}
