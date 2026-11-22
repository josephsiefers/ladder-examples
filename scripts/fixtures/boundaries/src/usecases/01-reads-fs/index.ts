// Violates `fs-only-where-allowed`: a use case reaching the filesystem directly.
import { readFileSync } from "node:fs";

export const contract = (): string => readFileSync("data/firm/contracts/a.md", "utf8");
