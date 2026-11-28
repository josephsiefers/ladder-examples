import { z } from "zod";
import {
  AMBIGUITIES,
  type Ambiguity,
  DOC_TYPES,
  type DocType,
  type IntakeDesk,
  TITLE_EVIDENCE,
} from "../../core/documents";
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
  NO_ANSWER,
  type Prediction,
  plural,
  type RunRecord,
  renderConfusionMatrix,
  row,
  tableHead,
} from "../../core/eval";
import { triageDocument } from "./triage";

export interface TriageEvalInput {
  documentId: string;
}

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

/** UC2 sets no fixed target; its upgrade trigger is hybrid accuracy materially below clean. */
function triageTarget(stats: readonly FieldStats[]): string {
  const mean = stats.find((stat) => stat.field === FIELD)?.mean ?? 0;
  return `docType accuracy ${formatPercent(mean)} (mean of runs) · upgrade trigger: hybrid accuracy materially below clean (see below)`;
}

/** Every case run as a prediction: gold type, predicted type (or no answer), and ambiguity. */
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
        predicted: result.error === undefined ? (result.actual[FIELD] ?? NO_ANSWER) : NO_ANSWER,
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
    `Overall accuracy, pooled over ${plural(all.length, "case run")}: ${formatRate(accuracy(all))}`,
    "",
    "### Per type (pooled over all runs)",
    "",
    ...tableHead(["Type", "Precision", "Recall", "Support"]),
    ...classMetrics(matrix).map(({ label, precision, recall, support }) =>
      row([label, formatRate(precision), formatRate(recall), String(support)]),
    ),
    "",
    "### Confusion matrix (pooled over all runs)",
    "",
    renderConfusionMatrix(matrix),
    "",
    "### Clean vs hybrid",
    "",
    ...tableHead(["Ambiguity", "Accuracy", "Case runs"]),
    ...accuracyByGroup(all, AMBIGUITIES).map(({ group, accuracy: rate, count }) =>
      row([group, formatRate(rate), String(count)]),
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
    describe: (value) => ({ [FIELD]: value.docType }),
    target: triageTarget,
    async evidenceText({ documentId }, paragraphId) {
      const document = await documents.readIntake(documentId);
      if (paragraphId === TITLE_EVIDENCE) return document.title;
      return document.paragraphs.find((paragraph) => paragraph.id === paragraphId)?.text;
    },
    documentLabel: ({ docType, ambiguity }) =>
      ambiguity === undefined ? docType : `${docType} (${ambiguity})`,
    analysis: triageAnalysis,
  };
}
