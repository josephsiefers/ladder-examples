import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Every file under `dir`, relative to it, with its content. */
export async function tree(dir: string): Promise<Record<string, string>> {
  const files = await readdir(dir, { recursive: true, withFileTypes: true });
  const entries = await Promise.all(
    files
      .filter((file) => file.isFile())
      .map(async (file) => {
        const path = join(file.parentPath, file.name);
        return [path.slice(dir.length + 1), await readFile(path, "utf8")] as const;
      }),
  );
  return Object.fromEntries(entries.toSorted(([a], [b]) => a.localeCompare(b)));
}
