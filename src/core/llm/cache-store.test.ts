import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileCacheStore, createMemoryCacheStore } from "./cache-store";

const KEY = "ab12cd34";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "llm-cache-store-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("file cache store", () => {
  it("keeps each entry at <dir>/<first 2 characters of key>/<key>.json", async () => {
    const store = createFileCacheStore(dir);

    await store.write(KEY, "entry");

    expect(store.locate(KEY)).toBe(join(dir, "ab", "ab12cd34.json"));
    expect(await readdir(join(dir, "ab"))).toEqual(["ab12cd34.json"]);
    expect(await store.read(KEY)).toBe("entry");
  });

  it("reads a missing entry as undefined", async () => {
    expect(await createFileCacheStore(dir).read(KEY)).toBeUndefined();
  });

  it("replaces an entry", async () => {
    const store = createFileCacheStore(dir);

    await store.write(KEY, "old");
    await store.write(KEY, "new");

    expect(await store.read(KEY)).toBe("new");
    expect(await readdir(join(dir, "ab"))).toEqual(["ab12cd34.json"]);
  });

  it("leaves no temporary file behind when the write fails", async () => {
    const store = createFileCacheStore(dir);
    // A non-empty directory where the entry should go makes the final rename fail.
    await mkdir(store.locate(KEY), { recursive: true });
    await writeFile(join(store.locate(KEY), "occupied"), "");

    await expect(store.write(KEY, "entry")).rejects.toThrow(/EISDIR|ENOTEMPTY|EEXIST/);

    expect(await readdir(join(dir, "ab"))).toEqual(["ab12cd34.json"]);
  });

  it("throws a read error other than a missing file, rather than reporting a miss", async () => {
    const store = createFileCacheStore(dir);
    await mkdir(store.locate(KEY), { recursive: true });

    await expect(store.read(KEY)).rejects.toThrow(/EISDIR/);
  });
});

describe("memory cache store", () => {
  it("reads back what was written, and undefined for anything else", async () => {
    const store = createMemoryCacheStore();

    await store.write(KEY, "entry");

    expect(await store.read(KEY)).toBe("entry");
    expect(await store.read("other")).toBeUndefined();
    expect(store.locate(KEY)).toBe("memory:ab12cd34");
  });
});
