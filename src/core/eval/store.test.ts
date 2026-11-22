import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { runRecord } from "./eval.fixtures";
import { createEvalStore, EmptySplitError, InvalidCaseError } from "./store";
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
