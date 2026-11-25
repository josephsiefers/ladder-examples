import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Contract, parseContract } from "./contract";
import { type IntakeDesk, IntakeNotFoundError, parseIntake, type RoutingRecord } from "./intake";

/** The fake firm's systems: `data/firm/` at the repo root. */
const FIRM_ROOT = fileURLToPath(new URL("../../../data/firm/", import.meta.url));

/** Where the fake firm's writes go: `out/firm/` at the repo root (gitignored). */
const FIRM_OUT_ROOT = fileURLToPath(new URL("../../../out/firm/", import.meta.url));

/** No contract with this ID exists in the firm. */
export class ContractNotFoundError extends Error {
  override name = "ContractNotFoundError";

  constructor(
    readonly contractId: string,
    knownIds: readonly string[],
  ) {
    const known = knownIds.length > 0 ? knownIds.join(", ") : "(none)";
    super(`Contract '${contractId}' not found. Known contracts: ${known}.`);
  }
}

/** Intent-level read access to the firm's contracts. */
export interface ContractReader {
  readContract(id: string): Promise<Contract>;
}

/** The whole translation layer: contracts and intake. */
export type FirmDocuments = ContractReader & IntakeDesk;

const DOCUMENT_FILE = /\.md$/;

/** The IDs of the `.md` documents in `dir`, sorted; none if it does not exist. */
async function documentIds(dir: string): Promise<string[]> {
  const files = await readdir(dir).catch(() => []);
  return files
    .filter((file) => DOCUMENT_FILE.test(file))
    .map((file) => file.replace(DOCUMENT_FILE, ""))
    .toSorted();
}

/**
 * The translation layer over the fake firm's systems under `root`. Routed documents are appended,
 * one JSON line each, to `<outRoot>/queues/<queue>.jsonl`.
 */
export function createFirmDocuments({
  root = FIRM_ROOT,
  outRoot = FIRM_OUT_ROOT,
  now = () => new Date(),
}: {
  root?: string;
  outRoot?: string;
  now?: () => Date;
} = {}): FirmDocuments {
  const contractsDir = join(root, "contracts");
  const intakeDir = join(root, "intake");
  const queuesDir = join(outRoot, "queues");

  // Only IDs listed in a directory are read, so a path-like ID can never escape it.
  async function intakePath(id: string): Promise<string> {
    const known = await documentIds(intakeDir);
    if (!known.includes(id)) throw new IntakeNotFoundError(id, known);
    return join(intakeDir, `${id}.md`);
  }

  return {
    async readContract(id) {
      const known = await documentIds(contractsDir);
      if (!known.includes(id)) throw new ContractNotFoundError(id, known);
      const markdown = await readFile(join(contractsDir, `${id}.md`), "utf8");
      return parseContract(id, markdown);
    },

    listIntake: () => documentIds(intakeDir),

    async readIntake(id) {
      return parseIntake(id, await readFile(await intakePath(id), "utf8"));
    },

    async routeToQueue({ documentId, queue, rationale }) {
      await intakePath(documentId);
      const record: RoutingRecord = {
        id: documentId,
        queue,
        rationale,
        routedAt: now().toISOString(),
      };
      const path = join(queuesDir, `${queue}.jsonl`);
      await mkdir(queuesDir, { recursive: true });
      await appendFile(path, `${JSON.stringify(record)}\n`);
      const lines = (await readFile(path, "utf8")).split("\n").filter((line) => line !== "");
      return { ...record, position: lines.length };
    },
  };
}
