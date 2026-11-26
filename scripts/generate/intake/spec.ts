import { z } from "zod";
import {
  AMBIGUITIES,
  type Ambiguity,
  DOC_TYPES,
  type DocType,
  type TITLE_EVIDENCE,
} from "../../../src/core/documents";

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
    /** Never names the document type: the triage prompt includes the ID. */
    id: z.string().regex(/^[a-z0-9-]+$/),
    split: z.enum(["dev", "test"]),
    /** Seeds the choice of title, opening and section variants. */
    seed: z.number().int().nonnegative(),
    docType: z.enum(DOC_TYPES),
    ambiguity: z.enum(AMBIGUITIES),
    /** Where the base document comes from. */
    base: z.discriminatedUnion("source", [
      /** A UC1 NDA from the firm's contracts, copied byte for byte. */
      z.object({ source: z.literal("nda-copy"), contractId: z.string().min(1) }),
      /** A short document assembled from one kind in the intake library, e.g. `msa`. */
      z.object({
        source: z.literal("library"),
        kind: z.string().min(1),
        parties: z.tuple([party, party]),
      }),
    ]),
    /** Hybrid ingredients from the intake library, in the order they are added. */
    ingredients: z.array(z.string().min(1)),
  })
  .superRefine((spec, context) => {
    if (spec.ingredients.length > 0 !== (spec.ambiguity === "hybrid")) {
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
  /** The title marker, then the paragraph IDs that establish primary purpose. */
  evidence: { docType: [typeof TITLE_EVIDENCE, ...string[]] };
}
