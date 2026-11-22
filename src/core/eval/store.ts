import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { EvalCase, EvalDefinition, RunRecord, Split } from "./types";

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

/** Where eval cases are read from and run records are saved. */
export interface EvalStore {
  /** Reads only `<eval>/<split>/`, so the test split is never read unless asked for. */
  loadCases<Input, Value>(
    definition: EvalDefinition<Input, Value>,
    split: Split,
  ): Promise<EvalCase<Input, Value>[]>;
  /** Saves the record as JSON and returns the file's path. */
  saveRunRecord(record: RunRecord): Promise<string>;
}

/** Cases live one per file at `<dataRoot>/<eval>/<split>/<caseId>.json`; records under `<reportsRoot>/evals/`. */
export function createEvalStore({
  dataRoot = DATA_ROOT,
  reportsRoot = REPORTS_ROOT,
}: {
  dataRoot?: string;
  reportsRoot?: string;
} = {}): EvalStore {
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
          const parsed = caseSchema.safeParse(parseJson(raw, label));
          if (!parsed.success) {
            const issues = parsed.error.issues.map(
              (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            throw new InvalidCaseError(label, issues.join("; "));
          }
          const { input, gold, evidence } = parsed.data;
          const id = file.replace(CASE_FILE, "");
          return { id, split, input, gold, ...(evidence && { evidence }) };
        }),
      );
    },

    async saveRunRecord(record) {
      const dir = join(reportsRoot, "evals");
      await mkdir(dir, { recursive: true });
      const stamp = record.startedAt.replaceAll(/[:.]/g, "-");
      const path = join(dir, `${record.eval}-${record.split}-${stamp}.json`);
      await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
      return path;
    },
  };
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new InvalidCaseError(label, "not valid JSON");
  }
}
