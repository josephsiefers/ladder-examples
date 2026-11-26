import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./json";
import { type PlantSpec, plantSpecSchema } from "./spec";

/** One plant spec per generated NDA, named `<id>.json`. */
const PLANTS_DIR = fileURLToPath(new URL("../../data/evals/snapshot/plants/", import.meta.url));

/** Reads and validates every plant spec in `dir`, sorted by ID. */
export async function loadPlantSpecs(dir: string = PLANTS_DIR): Promise<PlantSpec[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).toSorted();
  return Promise.all(
    files.map(async (file) => {
      const spec = await readJson(join(dir, file), plantSpecSchema, `plant spec ${file}`);
      if (`${spec.id}.json` !== file) {
        throw new Error(`Invalid plant spec ${file}: its id is '${spec.id}'.`);
      }
      return spec;
    }),
  );
}
