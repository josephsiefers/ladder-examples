import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { type PlantSpec, plantSpecSchema } from "./spec";

/** One plant spec per generated NDA, named `<id>.json`. */
const PLANTS_DIR = fileURLToPath(new URL("../../data/evals/snapshot/plants/", import.meta.url));

/** Reads and validates every NDA plant spec in `dir`, sorted by ID. */
export function loadPlantSpecs(dir: string = PLANTS_DIR): Promise<PlantSpec[]> {
  return loadSpecs(dir, plantSpecSchema);
}

/** Reads and validates every plant spec in `dir` against `schema`, sorted by ID. */
export async function loadSpecs<T extends { id: string }>(
  dir: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).toSorted();
  return Promise.all(
    files.map(async (file) => {
      const parsed = schema.safeParse(JSON.parse(await readFile(join(dir, file), "utf8")));
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        throw new Error(`Invalid plant spec ${file}: ${issues.join("; ")}.`);
      }
      if (`${parsed.data.id}.json` !== file) {
        throw new Error(`Invalid plant spec ${file}: its id is '${parsed.data.id}'.`);
      }
      return parsed.data;
    }),
  );
}
