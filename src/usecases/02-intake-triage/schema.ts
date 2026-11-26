import { z } from "zod";
import { DOC_TYPES } from "../../core/documents";

/** UC2's classification: one document type and the reason for it. */
export const classificationSchema = z.object({
  docType: z.enum(DOC_TYPES),
  rationale: z.string().min(1),
});

export type Classification = z.infer<typeof classificationSchema>;

export const CLASSIFICATION_SCHEMA_NAME = "intake-classification";
