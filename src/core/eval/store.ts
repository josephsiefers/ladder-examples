import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { MODELS } from "../llm";
import { type EvalCase, type EvalDefinition, type RunRecord, SPLITS, type Split } from "./types";

const DATA_ROOT = fileURLToPath(new URL("../../../data/evals/", import.meta.url));
const REPORTS_ROOT = fileURLToPath(new URL("../../../reports/", import.meta.url));

const CASE_FILE = /\.json$/;

/** A case file is unreadable or does not match its eval's case shape. */
export class InvalidCaseError extends Error {
  override name = "InvalidCaseError";

  constructor(
    readonly file: string,
    detail: string,
  ) {
    super(`Invalid eval case ${file}: ${detail}.`);
  }
}

/** The requested split holds no cases. */
export class EmptySplitError extends Error {
  override name = "EmptySplitError";

  constructor(evalName: string, split: Split) {
    super(`Eval '${evalName}': split ${split} has no cases yet.`);
  }
}

/** No run record exists yet for the eval and split. */
export class NoRunRecordError extends Error {
  override name = "NoRunRecordError";

  constructor(evalName: string, split: Split) {
    super(`Eval '${evalName}' has no run record for split ${split} yet; run the eval first.`);
  }
}

/** A run record file is unreadable or is not a run record. */
export class InvalidRunRecordError extends Error {
  override name = "InvalidRunRecordError";

  constructor(
    readonly file: string,
    detail: string,
  ) {
    super(`Invalid run record ${file}: ${detail}.`);
  }
}

const strings = z.record(z.string(), z.string());

const runRecordSchema = z.object({
  eval: z.string(),
  split: z.enum(SPLITS),
  runs: z.number().int().positive(),
  concurrency: z.number().int().positive(),
  startedAt: z.string(),
  wallTimeMs: z.number(),
  fields: z.array(z.string()),
  caseIds: z.array(z.string()),
  results: z.array(
    z.object({
      caseId: z.string(),
      run: z.number().int().nonnegative(),
      correct: z.record(z.string(), z.boolean()),
      expected: strings,
      actual: strings,
      output: z.unknown().optional(),
      error: z.string().optional(),
      calls: z.array(
        z.object({
          model: z.enum(MODELS),
          usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
          latencyMs: z.number(),
          cached: z.boolean(),
        }),
      ),
    }),
  ),
}) satisfies z.ZodType<RunRecord>;

/** A run record and the file it was read from. */
export interface StoredRunRecord {
  record: RunRecord;
  path: string;
}

/** Where eval cases are read from, and run records and review sheets are saved. */
export interface EvalStore {
  /** Reads only `<eval>/<split>/`, so the test split is never read unless asked for. */
  loadCases<Input, Value>(
    definition: EvalDefinition<Input, Value>,
    split: Split,
  ): Promise<EvalCase<Input, Value>[]>;
  /** Saves the record as JSON and returns the file's path. */
  saveRunRecord(record: RunRecord): Promise<string>;
  /** The most recent saved record of the eval on the split. */
  latestRunRecord(evalName: string, split: Split): Promise<StoredRunRecord>;
  /** The record saved at `path`, wherever it is. */
  loadRunRecord(path: string): Promise<StoredRunRecord>;
  /** Saves the review sheet of `record` as Markdown beside its run record and returns the file's path. */
  saveReviewSheet(record: RunRecord, markdown: string): Promise<string>;
}

/** A record's file name: `<eval>-<split>-<startedAt with : and . as ->`, which sorts by start time. */
const recordStem = (record: RunRecord) =>
  `${record.eval}-${record.split}-${record.startedAt.replaceAll(/[:.]/g, "-")}`;

const RECORD_STAMP = /^\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/;

async function loadRunRecord(path: string): Promise<StoredRunRecord> {
  const raw = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    throw error.code === "ENOENT" ? new InvalidRunRecordError(path, "no such file") : error;
  });
  const parsed = runRecordSchema.safeParse(
    parseJson(raw, (detail) => new InvalidRunRecordError(path, detail)),
  );
  if (!parsed.success) throw new InvalidRunRecordError(path, issueList(parsed.error));
  return { record: parsed.data, path };
}

/**
 * Cases live one per file at `<dataRoot>/<eval>/<split>/<caseId>.json`; run records and review
 * sheets under `<reportsRoot>/evals/`.
 */
export function createEvalStore({
  dataRoot = DATA_ROOT,
  reportsRoot = REPORTS_ROOT,
}: {
  dataRoot?: string;
  reportsRoot?: string;
} = {}): EvalStore {
  const recordsDir = join(reportsRoot, "evals");

  return {
    async loadCases(definition, split) {
      const dir = join(dataRoot, definition.name, split);
      const files = (await readdir(dir).catch(() => []))
        .filter((file) => CASE_FILE.test(file))
        .toSorted();
      if (files.length === 0) throw new EmptySplitError(definition.name, split);

      const caseSchema = z.object({
        input: definition.inputSchema,
        gold: definition.goldSchema,
        evidence: z.partialRecord(z.enum(definition.fields), z.array(z.string().min(1))).optional(),
      });
      return Promise.all(
        files.map(async (file) => {
          const label = join(definition.name, split, file);
          const raw = await readFile(join(dir, file), "utf8");
          const parsed = caseSchema.safeParse(
            parseJson(raw, (detail) => new InvalidCaseError(label, detail)),
          );
          if (!parsed.success) throw new InvalidCaseError(label, issueList(parsed.error));
          const { input, gold, evidence } = parsed.data;
          const id = file.replace(CASE_FILE, "");
          return { id, split, input, gold, ...(evidence && { evidence }) };
        }),
      );
    },

    async saveRunRecord(record) {
      await mkdir(recordsDir, { recursive: true });
      const path = join(recordsDir, `${recordStem(record)}.json`);
      await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
      return path;
    },

    async latestRunRecord(evalName, split) {
      const prefix = `${evalName}-${split}-`;
      const latest = (await readdir(recordsDir).catch(() => []))
        .filter((file) => file.startsWith(prefix) && RECORD_STAMP.test(file.slice(prefix.length)))
        .toSorted()
        .at(-1);
      if (latest === undefined) throw new NoRunRecordError(evalName, split);
      return loadRunRecord(join(recordsDir, latest));
    },

    loadRunRecord,

    async saveReviewSheet(record, markdown) {
      await mkdir(recordsDir, { recursive: true });
      const path = join(recordsDir, `${recordStem(record)}.review-sheet.md`);
      await writeFile(path, markdown);
      return path;
    },
  };
}

function parseJson(raw: string, invalid: (detail: string) => Error): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw invalid("not valid JSON");
  }
}

function issueList(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}
