import { z } from "zod";
import type { IntakeDesk } from "../../core/documents";
import {
  accuracy,
  accuracyByGroup,
  classMetrics,
  confusionMatrix,
  type EvalCase,
  type EvalDefinition,
  type FieldStats,
  formatPercent,
  formatRate,
  type Prediction,
  type RunRecord,
  renderConfusionMatrix,
} from "../../core/eval";
import { DOC_TYPES, type DocType } from "./schema";
import { triageDocument } from "./triage";

export interface TriageEvalInput {
  documentId: string;
}

export const AMBIGUITIES = ["clean", "hybrid"] as const;

export type Ambiguity = (typeof AMBIGUITIES)[number];

/**
 * What the eval compares: the gold label carries the document type and its ambiguity, the output
 * the document type and its rationale. Only the document type is scored.
 */
export interface TriageLabel {
  docType: DocType;
  ambiguity?: Ambiguity;
  rationale?: string;
}

const FIELD = "docType";

/** The evidence ID a gold case cites the document's title by; the generator writes the same. */
const TITLE_EVIDENCE = "title";

/** UC2 sets no fixed target; its upgrade trigger is hybrid accuracy materially below clean. */
function triageTarget(stats: readonly FieldStats[]): string {
  const mean = stats.find((stat) => stat.field === FIELD)?.mean ?? 0;
  return `docType accuracy ${formatPercent(mean)} (mean of runs) · upgrade trigger: hybrid accuracy materially below clean (see below)`;
}

/** Every case run as a prediction: gold type, predicted type (or the error), and ambiguity. */
function predictions(
  record: RunRecord,
  cases: readonly EvalCase<TriageEvalInput, TriageLabel>[],
): Prediction[] {
  return record.results.flatMap((result) => {
    const gold = cases.find((evalCase) => evalCase.id === result.caseId)?.gold;
    if (!gold) return [];
    return [
      {
        gold: gold.docType,
        predicted: result.actual[FIELD] ?? "",
        ...(gold.ambiguity && { group: gold.ambiguity }),
      },
    ];
  });
}

/** Overall accuracy, per-type precision and recall, the confusion matrix, clean vs hybrid. */
function triageAnalysis(
  record: RunRecord,
  cases: readonly EvalCase<TriageEvalInput, TriageLabel>[],
): string {
  const all = predictions(record, cases);
  const matrix = confusionMatrix(DOC_TYPES, all);
  return [
    `Overall accuracy, pooled over ${all.length} case run${all.length === 1 ? "" : "s"}: ${formatRate(accuracy(all))}`,
    "",
    "### Per type (pooled over all runs)",
    "",
    "| Type | Precision | Recall | Support |",
    "|---|---:|---:|---:|",
    ...classMetrics(matrix).map(
      ({ label, precision, recall, support }) =>
        `| ${label} | ${formatRate(precision)} | ${formatRate(recall)} | ${support} |`,
    ),
    "",
    "### Confusion matrix (pooled over all runs)",
    "",
    renderConfusionMatrix(matrix),
    "",
    "### Clean vs hybrid",
    "",
    "| Ambiguity | Accuracy | Case runs |",
    "|---|---:|---:|",
    ...accuracyByGroup(all, AMBIGUITIES).map(
      ({ group, accuracy: rate, count }) => `| ${group} | ${formatRate(rate)} | ${count} |`,
    ),
  ].join("\n");
}

/** The UC2 eval: classify each case's intake document (never routing it) and score its type. */
export function createTriageEval({
  documents,
}: {
  documents: IntakeDesk;
}): EvalDefinition<TriageEvalInput, TriageLabel> {
  return {
    name: "triage",
    fields: [FIELD],
    inputSchema: z.object({ documentId: z.string().min(1) }),
    goldSchema: z.object({ docType: z.enum(DOC_TYPES), ambiguity: z.enum(AMBIGUITIES) }),
    async run({ documentId }, { llm, sampleIndex }) {
      const { classification } = await triageDocument(
        documentId,
        { llm, documents },
        { sampleIndex },
      );
      return classification;
    },
    score: (output, gold) => ({ [FIELD]: output.docType === gold.docType }),
    // Gold carries its ambiguity, so the answer key reads e.g. `msa (hybrid)`; an output never does.
    describe: ({ docType, ambiguity }) => ({
      [FIELD]: ambiguity ? `${docType} (${ambiguity})` : docType,
    }),
    target: triageTarget,
    async evidenceText({ documentId }, paragraphId) {
      const document = await documents.readIntake(documentId);
      if (paragraphId === TITLE_EVIDENCE) return document.title;
      return document.paragraphs.find((paragraph) => paragraph.id === paragraphId)?.text;
    },
    analysis: triageAnalysis,
    reviewSheet: {
      sampleSize: 8,
      fieldColumn: false,
      headers: {
        case: "Document",
        expected: "Answer key (type, clean/hybrid)",
        source: "Title + evidence excerpt",
      },
    },
  };
}
