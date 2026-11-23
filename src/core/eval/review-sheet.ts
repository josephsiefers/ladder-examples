import { plural, row } from "./markdown";
import type { EvalCase, EvalDefinition, RunRecord } from "./types";

/** Agreeing rows shown in the random sample, unless asked otherwise. */
const DEFAULT_SAMPLE_SIZE = 10;
/** The sample's seed, unless asked otherwise; a fixed seed keeps one record's sheet the same every time. */
const DEFAULT_SAMPLE_SEED = 1;

export interface ReviewSheetOptions {
  sampleSize?: number;
  seed?: number;
}

const INSTRUCTIONS =
  "For each row, does the source sentence say what the answer key says? On disagreement rows, decide whether the model, the key, or neither is right.";

/** One (case, field) of a run record: the answer key's value next to what each run said. */
interface ReviewRow {
  caseId: string;
  field: string;
  expected: string;
  /** Per run, in run order. */
  runs: { said: string; agrees: boolean }[];
}

export interface ReviewSheet {
  markdown: string;
  /** What the sheet holds, e.g. `1 disagreement row · random sample of 10 of 71 agreeing rows`. */
  summary: string;
}

/**
 * The review sheet of one run record: every (case, field) row where any run differed from the
 * answer key, then a seeded random sample of agreeing rows, each next to its evidence text.
 */
export async function buildReviewSheet<Input, Value>(
  definition: Pick<EvalDefinition<Input, Value>, "evidenceText">,
  record: RunRecord,
  cases: readonly EvalCase<Input, Value>[],
  { sampleSize = DEFAULT_SAMPLE_SIZE, seed = DEFAULT_SAMPLE_SEED }: ReviewSheetOptions = {},
): Promise<ReviewSheet> {
  const rows = reviewRows(record);
  const disagreements = rows.filter((reviewRow) => reviewRow.runs.some((run) => !run.agrees));
  const agreeing = rows.filter((reviewRow) => reviewRow.runs.every((run) => run.agrees));
  const sample = seededSample(agreeing, sampleSize, seed);
  const casesById = new Map(cases.map((evalCase) => [evalCase.id, evalCase]));
  const unknown = record.caseIds.find((caseId) => !casesById.has(caseId));
  if (unknown !== undefined) throw new UnknownCaseError(unknown);

  const table = async (tableRows: ReviewRow[]) => {
    if (tableRows.length === 0) return ["None."];
    const header = ["Case", "Field", "Answer key says"];
    for (let run = 1; run <= record.runs; run++) header.push(`Model said (run ${run})`);
    header.push("Source sentence");
    const body = await Promise.all(
      tableRows.map(async (reviewRow) =>
        row([
          reviewRow.caseId,
          reviewRow.field,
          reviewRow.expected,
          ...reviewRow.runs.map((run) => (run.agrees ? run.said : `✗ ${run.said}`)),
          await sourceText(definition, casesById.get(reviewRow.caseId), reviewRow.field),
        ]),
      ),
    );
    return [row(header), row(header.map(() => "---")), ...body];
  };

  const markdown = [
    `# Review sheet: eval ${record.eval} · split ${record.split} · run of ${record.startedAt}`,
    "",
    INSTRUCTIONS,
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

/** Every (case, field) of the record, in case then field order; results are already in run order. */
function reviewRows(record: RunRecord): ReviewRow[] {
  return record.caseIds.flatMap((caseId) => {
    const results = record.results.filter((result) => result.caseId === caseId);
    return record.fields.map((field) => ({
      caseId,
      field,
      expected: results[0]?.expected[field] ?? "",
      runs: results.map((result) => ({
        said: result.actual[field] ?? "",
        agrees: result.correct[field] === true,
      })),
    }));
  });
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

/** The text of each paragraph the answer key cites for the field, each marked with its ID. */
async function sourceText<Input, Value>(
  definition: Pick<EvalDefinition<Input, Value>, "evidenceText">,
  evalCase: EvalCase<Input, Value> | undefined,
  field: string,
): Promise<string> {
  if (!evalCase?.evidence) return "(no evidence recorded)";
  const ids = evalCase.evidence[field] ?? [];
  if (ids.length === 0) return "(no sentence: field should be absent)";
  const texts = await Promise.all(
    ids.map(
      async (id) =>
        `[${id}] ${(await definition.evidenceText(evalCase.input, id)) ?? "(no such paragraph)"}`,
    ),
  );
  return texts.join(" ");
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
