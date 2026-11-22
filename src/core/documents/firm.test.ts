import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MalformedContractError } from "./contract";
import { ContractNotFoundError, createFirmDocuments } from "./firm";

const WELL_FORMED = "# NDA\n\n## 1. Parties and Background\n\n1.1 Alpha and Beta.\n";

let root: string;

async function writeContract(id: string, markdown: string) {
  await writeFile(join(root, "contracts", `${id}.md`), markdown);
}

describe("firm documents", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "firm-"));
    await mkdir(join(root, "contracts"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads a contract by ID", async () => {
    await writeContract("nda-a", WELL_FORMED);

    const contract = await createFirmDocuments({ root }).readContract("nda-a");

    expect(contract.id).toBe("nda-a");
    expect(contract.sections[0]?.paragraphs).toEqual([{ id: "1.1", text: "Alpha and Beta." }]);
  });

  it("reports an unknown ID as not found, listing the known IDs", async () => {
    await writeContract("nda-b", WELL_FORMED);
    await writeContract("nda-a", WELL_FORMED);
    await writeFile(join(root, "contracts", "notes.txt"), "not a contract");
    await writeFile(join(root, "contracts", "nda-c.md.orig"), WELL_FORMED);

    const read = createFirmDocuments({ root }).readContract("does-not-exist");

    await expect(read).rejects.toThrow(ContractNotFoundError);
    await expect(read).rejects.toMatchObject({
      name: "ContractNotFoundError",
      message: "Contract 'does-not-exist' not found. Known contracts: nda-a, nda-b.",
    });
  });

  it("says so when the firm has no contracts", async () => {
    const read = createFirmDocuments({ root }).readContract("nda-a");

    await expect(read).rejects.toThrow("Contract 'nda-a' not found. Known contracts: (none).");
  });

  it("says so when the firm has no contracts directory", async () => {
    const read = createFirmDocuments({ root: join(root, "missing") }).readContract("nda-a");

    await expect(read).rejects.toThrow("Contract 'nda-a' not found. Known contracts: (none).");
  });

  it("treats an ID that is a path as not found, without reading outside the firm", async () => {
    await writeFile(join(root, "secret.md"), WELL_FORMED);

    const read = createFirmDocuments({ root }).readContract("../secret");

    await expect(read).rejects.toThrow(ContractNotFoundError);
  });

  it("reports a malformed file as malformed, not as missing", async () => {
    await writeContract("nda-bad", "# NDA\n\n## 1. Parties and Background\n\nno number\n");

    const read = createFirmDocuments({ root }).readContract("nda-bad");

    await expect(read).rejects.toThrow(MalformedContractError);
    await expect(read).rejects.toThrow("Contract 'nda-bad' is malformed at line 5");
  });

  it("reads the firm's own sample NDA from the default root", async () => {
    const contract = await createFirmDocuments().readContract("nda-sample-01");

    expect(contract.title).toBe("Mutual Non-Disclosure Agreement");
    expect(contract.sections[0]?.heading).toBe("Parties and Background");
  });
});
