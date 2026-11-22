import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Contract, parseContract } from "./contract";

/** The fake firm's systems: `data/firm/` at the repo root. */
const FIRM_ROOT = fileURLToPath(new URL("../../../data/firm/", import.meta.url));

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

const CONTRACT_FILE = /\.md$/;

/** The translation layer over the fake firm's systems under `root`. */
export function createFirmDocuments({ root = FIRM_ROOT }: { root?: string } = {}): ContractReader {
  const contractsDir = join(root, "contracts");

  async function knownContractIds(): Promise<string[]> {
    const files = await readdir(contractsDir).catch(() => []);
    return files
      .filter((file) => CONTRACT_FILE.test(file))
      .map((file) => file.replace(CONTRACT_FILE, ""))
      .toSorted();
  }

  return {
    async readContract(id) {
      const known = await knownContractIds();
      // Only IDs listed in the contracts directory are read, so a path-like ID can never escape it.
      if (!known.includes(id)) throw new ContractNotFoundError(id, known);
      const markdown = await readFile(join(contractsDir, `${id}.md`), "utf8");
      return parseContract(id, markdown);
    },
  };
}
