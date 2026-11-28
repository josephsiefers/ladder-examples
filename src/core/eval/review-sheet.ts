import { plural, row } from "./markdown";
import type { EvalCase, EvalDefinition, RunRecord } from "./types";

/** The sample's seed, unless asked otherwise; a fixed seed keeps one record's sheet the same every time. */
const DEFAULT_SAMPLE_SEED = 1;
/** Evidence paragraphs on a document-level sheet are cut to this many characters. */
const EXCERPT_LENGTH = 160;

export interface ReviewSheetOptions {
  sampleSize?: number;
  seed?: number;
}

/** One row of the sheet: its leading cells, then what each run said, then its evidence. */
interface ReviewRow {
  caseId: string;
  /** The cells before the runs: what the row is, and what the answer key says. */
  key: string[];
  /** The fields whose evidence the row shows. */
  fields: readonly string[];
  /** Per run, in run order. */
  runs: { said: string; agrees: boolean }[];
}

/** How a sheet is laid out: per (case, field) for field-level facts, or per case for a document-level label. */
interface Layout {
  instructions: string;
  keyHeader: string[];
  sourceHeader: string;
  sampleSize: number;
  /** Each evidence paragraph is cut to this many characters. */
  excerptLength: number;
  rows(record: RunRecord): ReviewRow[];
}

const READING_CHECK =
  "On disagreement rows, decide whether the model, the key, or neither is right.";

/** Every (case, field) of the record, in case then field order; results are already in run order. */
const FIELD_LAYOUT: Layout = {
  instructions: `For each row, does the source sentence say what the answer key says? ${READING_CHECK}`,
  keyHeader: ["Case", "Field", "Answer key says"],
  sourceHeader: "Source sentence",
  sampleSize: 10,
  excerptLength: Number.POSITIVE_INFINITY,
  rows: (record) =>
    record.caseIds.flatMap((caseId) => {
      const results = resultsOf(record, caseId);
      return record.fields.map((field) => ({
        caseId,
        key: [caseId, field, results[0]?.expected[field] ?? ""],
        fields: [field],
        runs: results.map((result) => ({
          said: result.actual[field] ?? "",
          agrees: result.correct[field] === true,
        })),
      }));
    }),
};

/** One row per case, its answer key the gold value's document-level label. */
function documentLayout(label: (caseId: string) => string): Layout {
  return {
    instructions: `For each row, do the title and evidence excerpt show what the answer key says? ${READING_CHECK}`,
    keyHeader: ["Document", "Answer key"],
    sourceHeader: "Title + evidence excerpt",
    sampleSize: 8,
    excerptLength: EXCERPT_LENGTH,
    rows: (record) =>
      record.caseIds.map((caseId) => ({
        caseId,
        key: [caseId, label(caseId)],
        fields: record.fields,
        runs: resultsOf(record, caseId).map((result) => ({
          said: record.fields.map((field) => result.actual[field] ?? "").join(" · "),
          agrees: record.fields.every((field) => result.correct[field] === true),
        })),
      })),
  };
}

function resultsOf(record: RunRecord, caseId: string) {
  return record.results.filter((result) => result.caseId === caseId);
}

export interface ReviewSheet {
  markdown: string;
  /** What the sheet holds, e.g. `1 disagreement row · random sample of 10 of 71 agreeing rows`. */
  summary: string;
}

/**
 * The review sheet of one run record: every row where any run differed from the answer key, then
 * a seeded random sample of agreeing rows, each next to its evidence text. A row is one
 * (case, field), or one case when the eval gives a document-level label.
 */
export async function buildReviewSheet<Input, Value>(
  definition: Pick<EvalDefinition<Input, Value>, "evidenceText" | "documentLabel">,
  record: RunRecord,
  cases: readonly EvalCase<Input, Value>[],
  { sampleSize, seed = DEFAULT_SAMPLE_SEED }: ReviewSheetOptions = {},
): Promise<ReviewSheet> {
  const casesById = new Map(cases.map((evalCase) => [evalCase.id, evalCase]));
  const caseOf = (caseId: string) => {
    const evalCase = casesById.get(caseId);
    if (!evalCase) throw new UnknownCaseError(caseId);
    return evalCase;
  };
  // Refuse the record up front, even when the missing case would not be shown on the sheet.
  for (const caseId of record.caseIds) caseOf(caseId);
  const { documentLabel } = definition;
  const layout = documentLabel
    ? documentLayout((caseId) => documentLabel(caseOf(caseId).gold))
    : FIELD_LAYOUT;

  const rows = layout.rows(record);
  const disagreements = rows.filter((reviewRow) => reviewRow.runs.some((run) => !run.agrees));
  const agreeing = rows.filter((reviewRow) => reviewRow.runs.every((run) => run.agrees));
  const sample = seededSample(agreeing, sampleSize ?? layout.sampleSize, seed);

  const table = async (tableRows: ReviewRow[]) => {
    if (tableRows.length === 0) return ["None."];
    const header = [...layout.keyHeader];
    for (let run = 1; run <= record.runs; run++) header.push(`Model said (run ${run})`);
    header.push(layout.sourceHeader);
    const body = await Promise.all(
      tableRows.map(async (reviewRow) =>
        row([
          ...reviewRow.key,
          ...reviewRow.runs.map((run) => (run.agrees ? run.said : `✗ ${run.said}`)),
          await sourceText(definition, caseOf(reviewRow.caseId), reviewRow.fields, layout),
        ]),
      ),
    );
    return [row(header), row(header.map(() => "---")), ...body];
  };

  const markdown = [
    `# Review sheet: eval ${record.eval} · split ${record.split} · run of ${record.startedAt}`,
    "",
    layout.instructions,
    "",
    "This is a reading check, not a legal one. ✗ marks a run that differed from the answer key.",
    "",
    `## Disagreements: ${plural(disagreements.length, "row")}`,
    "",
    ...(await table(disagreements)),
    "",
    `## Agreeing rows: random sample of ${sample.length} of ${agreeing.length} (seed ${seed})`,
    "",
    ...(await table(sample)),
    "",
  ].join("\n");
  return {
    markdown,
    summary: [
      plural(disagreements.length, "disagreement row"),
      `random sample of ${sample.length} of ${plural(agreeing.length, "agreeing row")}`,
    ].join(" · "),
  };
}

/** A run record case that the dataset no longer holds, so its answer key cannot be shown. */
export class UnknownCaseError extends Error {
  override name = "UnknownCaseError";

  constructor(readonly caseId: string) {
    super(
      `Run record case '${caseId}' is not in the dataset; the answer key may have changed since the run.`,
    );
  }
}

/** The text of each paragraph the answer key cites for the fields, each marked with its ID. */
async function sourceText<Input, Value>(
  definition: Pick<EvalDefinition<Input, Value>, "evidenceText">,
  evalCase: EvalCase<Input, Value>,
  fields: readonly string[],
  { excerptLength }: Layout,
): Promise<string> {
  const { evidence } = evalCase;
  if (!evidence) return "(no evidence recorded)";
  const ids = fields.flatMap((field) => evidence[field] ?? []);
  if (ids.length === 0) return "(no sentence: field should be absent)";
  const texts = await Promise.all(
    ids.map(async (id) => {
      const text = (await definition.evidenceText(evalCase.input, id)) ?? "(no such paragraph)";
      return `[${id}] ${excerpt(text, excerptLength)}`;
    }),
  );
  return texts.join(" ");
}

/** The text, cut to `length` characters and marked with an ellipsis if it was longer. */
function excerpt(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length).trimEnd()}…`;
}

/** Up to `size` of `items`, picked by a seeded shuffle (mulberry32) and kept in their original order. */
function seededSample<T>(items: readonly T[], size: number, seed: number): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const indices = items.map((_, index) => index);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j] as number, indices[i] as number];
  }
  return indices
    .slice(0, size)
    .toSorted((a, b) => a - b)
    .map((index) => items[index] as T);
}
