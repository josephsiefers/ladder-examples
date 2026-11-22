import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Contract, createFirmDocuments } from "../../src/core/documents";
import type { GeneratedNda } from "./assemble";
import type { PlantSpec } from "./spec";

/**
 * A worked example: a one-way NDA with a "mutual discussions" recital, a party "and its
 * Affiliates", a date in words, a term in years with a survival period that looks like it, and
 * English law with Singapore courts.
 */
export const WORKED_SPEC: PlantSpec = {
  id: "nda-worked",
  split: "dev",
  seed: 7,
  parties: [
    { name: "Kestrel Bioanalytics Limited", short: "Kestrel", affiliates: true },
    { name: "Marlow Data Systems Ltd", short: "Marlow" },
  ],
  purpose: "a possible licence of Kestrel's assay software",
  mutuality: { kind: "one-way", discloser: 0, recital: "mutual-discussions" },
  effectiveDate: { kind: "date", value: "2025-03-03", phrasing: "words" },
  term: { kind: "fixed", months: 24, unit: "years" },
  survivalPeriod: { kind: "fixed", months: 60, unit: "years", phrasing: "like-term" },
  governingLaw: "england-and-wales",
  courts: "singapore",
};

/** A mutual NDA that states no effective date and runs until terminated on notice. */
export const MUTUAL_SPEC: PlantSpec = {
  id: "nda-mutual",
  split: "test",
  seed: 11,
  parties: [
    { name: "Brightwater Analytics, Inc.", short: "Brightwater" },
    { name: "Solano Grid Technologies LLC", short: "Solano" },
  ],
  purpose: "a possible joint offering of forecasting software and battery controls",
  mutuality: { kind: "mutual" },
  effectiveDate: { kind: "not-stated" },
  term: { kind: "until-terminated", noticeDays: 30 },
  survivalPeriod: { kind: "indefinite" },
  governingLaw: "california",
  courts: "california",
};

/** Reads a generated NDA back through the firm's translation layer, as UC1 will read it. */
export async function readAsFirmContract(nda: GeneratedNda): Promise<Contract> {
  const root = await mkdtemp(join(tmpdir(), "nda-"));
  try {
    await mkdir(join(root, "contracts"));
    await writeFile(join(root, "contracts", `${nda.contractId}.md`), nda.markdown);
    return await createFirmDocuments({ root }).readContract(nda.contractId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
