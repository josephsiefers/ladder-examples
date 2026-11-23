import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { caseRun, runRecord } from "./eval.fixtures";
import {
  createEvalStore,
  EmptySplitError,
  InvalidCaseError,
  InvalidRunRecordError,
  NoRunRecordError,
} from "./store";
import type { EvalDefinition } from "./types";

const definition = {
  name: "toy",
  fields: ["colour", "size"],
  inputSchema: z.object({ text: z.string() }),
  goldSchema: z.object({ colour: z.string(), size: z.number() }),
} as unknown as EvalDefinition<{ text: string }, { colour: string; size: number }>;

let root: string;

async function writeCase(split: string, file: string, content: unknown) {
  const dir = join(root, "evals", "toy", split);
  await mkdir(dir, { recursive: true });
  const text = typeof content === "string" ? content : JSON.stringify(content);
  await writeFile(join(dir, file), text);
}

const store = () =>
  createEvalStore({ dataRoot: join(root, "evals"), reportsRoot: join(root, "reports") });

const good = { input: { text: "hi" }, gold: { colour: "red", size: 3 } };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "eval-store-"));
});

describe("loadCases", () => {
  it("loads every case file in the split, named by its file, in order", async () => {
    await writeCase("smoke", "b.json", { ...good, evidence: { size: ["7.1", "7.2"] } });
    await writeCase("smoke", "a.json", good);
    await writeCase("smoke", "notes.txt", "not a case");
    await writeCase("dev", "c.json", good);

    const cases = await store().loadCases(definition, "smoke");

    expect(cases).toEqual([
      { id: "a", split: "smoke", input: { text: "hi" }, gold: { colour: "red", size: 3 } },
      {
        id: "b",
        split: "smoke",
        input: { text: "hi" },
        gold: { colour: "red", size: 3 },
        evidence: { size: ["7.1", "7.2"] },
      },
    ]);
  });

  it("never reads the test split unless it is requested", async () => {
    await writeCase("smoke", "a.json", good);
    await writeCase("dev", "a.json", good);
    await writeCase("test", "a.json", "{ unreadable");

    await expect(store().loadCases(definition, "smoke")).resolves.toHaveLength(1);
    await expect(store().loadCases(definition, "dev")).resolves.toHaveLength(1);
    await expect(store().loadCases(definition, "test")).rejects.toThrow(InvalidCaseError);
  });

  it.each([
    { problem: "is not JSON", content: "{ nope", detail: /not valid JSON/ },
    { problem: "has invalid gold", content: { ...good, gold: { colour: "red" } }, detail: /size/ },
    { problem: "has no input", content: { gold: good.gold }, detail: /input/ },
    {
      problem: "cites evidence for an unknown field",
      content: { ...good, evidence: { weight: ["1.1"] } },
      detail: /evidence.*weight/,
    },
  ])("names the file when a case $problem", async ({ content, detail }) => {
    await writeCase("dev", "broken.json", content);

    const loading = store().loadCases(definition, "dev");

    await expect(loading).rejects.toThrow(InvalidCaseError);
    await expect(loading).rejects.toThrow(/toy\/dev\/broken\.json/);
    await expect(loading).rejects.toThrow(detail);
  });

  it("says clearly when the split has no cases", async () => {
    await writeCase("smoke", "a.json", good);
    await mkdir(join(root, "evals", "toy", "test"), { recursive: true });

    await expect(store().loadCases(definition, "dev")).rejects.toThrow(EmptySplitError);
    await expect(store().loadCases(definition, "dev")).rejects.toThrow(
      "Eval 'toy': split dev has no cases yet.",
    );
    await expect(store().loadCases(definition, "test")).rejects.toThrow(
      "split test has no cases yet",
    );
  });
});

describe("saveRunRecord", () => {
  it("saves the full run record as JSON under reports/evals and returns its path", async () => {
    const record = runRecord([], { eval: "toy", split: "dev" });

    const path = await store().saveRunRecord(record);

    expect(path).toBe(join(root, "reports", "evals", "toy-dev-2026-11-22T09-00-00-000Z.json"));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(record);
  });
});

const recordAt = (startedAt: string, split: "dev" | "smoke" = "dev") =>
  runRecord([caseRun("a", 0, { colour: true, size: false })], { eval: "toy", split, startedAt });

describe("run records for review", () => {
  it("finds the latest record of the eval and split", async () => {
    const latest = recordAt("2026-11-22T21:00:00.000Z");
    for (const record of [
      recordAt("2026-11-22T09:00:00.000Z"),
      latest,
      recordAt("2026-11-22T10:00:00.000Z"),
      recordAt("2026-11-23T09:00:00.000Z", "smoke"),
      runRecord([], { eval: "toy-two", split: "dev", startedAt: "2026-11-24T09:00:00.000Z" }),
    ]) {
      await store().saveRunRecord(record);
    }

    const found = await store().latestRunRecord("toy", "dev");

    expect(found.record).toEqual(latest);
    expect(found.path).toBe(
      join(root, "reports", "evals", "toy-dev-2026-11-22T21-00-00-000Z.json"),
    );
  });

  it("says clearly when the eval has no record for the split", async () => {
    await store().saveRunRecord(recordAt("2026-11-22T09:00:00.000Z", "smoke"));

    await expect(store().latestRunRecord("toy", "dev")).rejects.toThrow(NoRunRecordError);
    await expect(store().latestRunRecord("toy", "dev")).rejects.toThrow(
      "Eval 'toy' has no run record for split dev yet; run the eval first.",
    );
  });

  it("loads a chosen record by its path", async () => {
    const record = recordAt("2026-11-22T09:00:00.000Z");
    const path = await store().saveRunRecord(record);

    await expect(store().loadRunRecord(path)).resolves.toEqual({ record, path });
  });

  it("says clearly when a chosen record does not exist", async () => {
    const path = join(root, "missing.json");

    await expect(store().loadRunRecord(path)).rejects.toThrow(
      new InvalidRunRecordError(path, "no such file"),
    );
  });

  it.each([
    { problem: "is not JSON", content: "{ nope", detail: /not valid JSON/ },
    { problem: "is not a run record", content: '{ "eval": "toy" }', detail: /results/ },
  ])("names the file when a chosen record $problem", async ({ content, detail }) => {
    const path = join(root, "broken.json");
    await writeFile(path, content);

    const loading = store().loadRunRecord(path);

    await expect(loading).rejects.toThrow(InvalidRunRecordError);
    await expect(loading).rejects.toThrow(path);
    await expect(loading).rejects.toThrow(detail);
  });

  it("saves a review sheet as Markdown next to the run records and returns its path", async () => {
    const path = await store().saveReviewSheet(recordAt("2026-11-22T09:00:00.000Z"), "# Sheet\n");

    expect(path).toBe(
      join(root, "reports", "evals", "toy-dev-2026-11-22T09-00-00-000Z.review-sheet.md"),
    );
    expect(await readFile(path, "utf8")).toBe("# Sheet\n");
    await expect(store().latestRunRecord("toy", "dev")).rejects.toThrow(NoRunRecordError);
  });
});
