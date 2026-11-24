import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFirmDocuments } from "./firm";
import { IntakeNotFoundError, MalformedIntakeError } from "./intake";

let root: string;
let outRoot: string;
const ROUTED_AT = new Date("2026-11-24T09:30:00.000Z");

const firm = () => createFirmDocuments({ root, outRoot, now: () => ROUTED_AT });

async function writeIntake(id: string, markdown: string) {
  await writeFile(join(root, "intake", `${id}.md`), markdown);
}

const queueLines = async (queue: string) =>
  (await readFile(join(outRoot, "queues", `${queue}.jsonl`), "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));

describe("intake documents", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "firm-"));
    outRoot = join(root, "out");
    await mkdir(join(root, "intake"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("lists intake document IDs in order, ignoring other files", async () => {
    await writeIntake("intake-b", "# B\n\nText.\n");
    await writeIntake("intake-a", "# A\n\nText.\n");
    await writeFile(join(root, "intake", "notes.txt"), "not a document");

    expect(await firm().listIntake()).toEqual(["intake-a", "intake-b"]);
  });

  it("lists nothing when the firm has no intake directory", async () => {
    const documents = createFirmDocuments({ root: join(root, "missing"), outRoot });

    expect(await documents.listIntake()).toEqual([]);
  });

  it("reads a free-form document as its title and paragraphs", async () => {
    await writeIntake(
      "intake-a",
      "# Letter of Intent\n\nDear Ms Okafor,\nwe write about the deal.\n\n\nYours sincerely\n",
    );

    expect(await firm().readIntake("intake-a")).toEqual({
      id: "intake-a",
      title: "Letter of Intent",
      paragraphs: [
        { text: "Dear Ms Okafor, we write about the deal." },
        { text: "Yours sincerely" },
      ],
    });
  });

  it("keeps the paragraph IDs a numbered document has, and its headings as text", async () => {
    await writeIntake(
      "intake-a",
      "# MSA\n\n## 1. Services\n\n1.1 The Supplier will.\n\n1.2 And.\n",
    );

    const document = await firm().readIntake("intake-a");

    expect(document.paragraphs).toEqual([
      { text: "## 1. Services" },
      { id: "1.1", text: "The Supplier will." },
      { id: "1.2", text: "And." },
    ]);
  });

  it("rejects a document without a title line", async () => {
    await writeIntake("intake-a", "\nNo title here.\n");

    const read = firm().readIntake("intake-a");

    await expect(read).rejects.toThrow(MalformedIntakeError);
    await expect(read).rejects.toThrow(
      "Intake document 'intake-a' is malformed: expected a '# Title' first line.",
    );
  });

  it("reports an unknown ID as not found, listing the known IDs", async () => {
    await writeIntake("intake-a", "# A\n\nText.\n");

    const read = firm().readIntake("../intake-a");

    await expect(read).rejects.toThrow(IntakeNotFoundError);
    await expect(read).rejects.toThrow(
      "Intake document '../intake-a' not found. Known intake documents: intake-a.",
    );
  });

  it("routes a document to a queue and returns a receipt", async () => {
    await writeIntake("intake-a", "# A\n\nText.\n");

    const receipt = await firm().routeToQueue({
      documentId: "intake-a",
      queue: "privacy",
      rationale: "A data processing agreement.",
    });

    const record = {
      id: "intake-a",
      queue: "privacy",
      rationale: "A data processing agreement.",
      routedAt: "2026-11-24T09:30:00.000Z",
    };
    expect(receipt).toEqual({ ...record, position: 1 });
    expect(await queueLines("privacy")).toEqual([record]);
  });

  it("appends to a queue rather than overwriting it", async () => {
    await writeIntake("intake-a", "# A\n\nText.\n");
    await writeIntake("intake-b", "# B\n\nText.\n");
    const documents = firm();

    await documents.routeToQueue({ documentId: "intake-a", queue: "commercial", rationale: "x" });
    const second = await documents.routeToQueue({
      documentId: "intake-b",
      queue: "commercial",
      rationale: "y",
    });
    await documents.routeToQueue({ documentId: "intake-a", queue: "privacy", rationale: "z" });

    expect(second.position).toBe(2);
    expect((await queueLines("commercial")).map((line) => line.id)).toEqual([
      "intake-a",
      "intake-b",
    ]);
    expect((await queueLines("privacy")).map((line) => line.id)).toEqual(["intake-a"]);
  });

  it("refuses to route an unknown document, writing nothing", async () => {
    const route = firm().routeToQueue({ documentId: "nope", queue: "privacy", rationale: "x" });

    await expect(route).rejects.toThrow(IntakeNotFoundError);
    await expect(readFile(join(outRoot, "queues", "privacy.jsonl"))).rejects.toThrow(/ENOENT/);
  });

  it("reads the firm's own hand-written intake documents from the default root", async () => {
    const documents = createFirmDocuments({ outRoot });
    const ids = await documents.listIntake();

    expect(ids).toEqual([
      "intake-hand-01",
      "intake-hand-02",
      "intake-hand-03",
      "intake-hand-04",
      "intake-hand-05",
    ]);
    for (const id of ids) {
      const document = await documents.readIntake(id);
      const words = document.paragraphs.flatMap((p) => p.text.split(/\s+/)).length;
      expect(words).toBeGreaterThanOrEqual(400);
      expect(words).toBeLessThanOrEqual(800);
    }
  });
});
