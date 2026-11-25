import { z } from "zod";

/** The document types, by primary purpose. See the UC2 spec. */
export const DOC_TYPES = ["nda", "msa", "dpa", "sow", "other"] as const;

export type DocType = (typeof DOC_TYPES)[number];

/** UC2's classification: one document type and the reason for it. */
export const classificationSchema = z.object({
  docType: z.enum(DOC_TYPES),
  rationale: z.string().min(1),
});

export type Classification = z.infer<typeof classificationSchema>;

export const CLASSIFICATION_SCHEMA_NAME = "intake-classification";
