import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The committed cache, at the repo root. */
const LLM_CACHE_DIR = fileURLToPath(new URL("../../../.cache/llm/", import.meta.url));

/** Where LLM cache entries are kept, as text by cache key. */
export interface CacheStore {
  /** Where the entry for `key` lives, for error messages. */
  locate(key: string): string;
  /** The entry's text, or undefined when there is none. */
  read(key: string): Promise<string | undefined>;
  /** Replaces the entry, atomically: a reader sees the old text or the new, never part of it. */
  write(key: string, text: string): Promise<void>;
}

/** Entries as files `<dir>/<first 2 hex of key>/<key>.json`, sharded so no directory grows huge. */
export function createFileCacheStore(dir: string = LLM_CACHE_DIR): CacheStore {
  const locate = (key: string) => join(dir, key.slice(0, 2), `${key}.json`);
  return {
    locate,
    async read(key) {
      try {
        return await readFile(locate(key), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    async write(key, text) {
      const file = locate(key);
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      try {
        await writeFile(temporary, text);
        await rename(temporary, file);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
  };
}

/** An in-memory store for tests. */
export function createMemoryCacheStore(): CacheStore {
  const entries = new Map<string, string>();
  return {
    locate: (key) => `memory:${key}`,
    async read(key) {
      return entries.get(key);
    },
    async write(key, text) {
      entries.set(key, text);
    },
  };
}
