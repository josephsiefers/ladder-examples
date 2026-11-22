import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createCachedLlm } from "./cache";
import { createFileCacheStore } from "./cache-store";
import { CacheMissError, CorruptCacheEntryError } from "./errors";
import { createFakeLlm } from "./fake";
import type { Llm } from "./llm";

const YES_NO = z.object({ answer: z.enum(["yes", "no"]) });

const REQUEST = {
  model: "claude-haiku-5-5",
  system: "Answer yes or no.",
  prompt: "Is the sky blue?",
  schema: YES_NO,
  schemaName: "yes-no",
} as const;

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "llm-cache-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The file store over this test's directory. */
const fileStore = () => createFileCacheStore(dir);

/** A call-counting fake LLM that answers "yes" with fixed usage and latency. */
function liveLlm(answer: () => "yes" | "no" = () => "yes") {
  return createFakeLlm(() => ({ answer: answer() }), {
    usage: { inputTokens: 1200, outputTokens: 30 },
    latencyMs: 2500,
  });
}

/** Every file under the cache directory, relative to it. */
async function cacheFiles(): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .toSorted();
}

/** Records one entry, lets `corrupt` rewrite its JSON, and returns its path. */
async function corruptEntry(corrupt: (entry: Record<string, unknown>) => unknown) {
  await createCachedLlm(liveLlm(), { store: fileStore() }).extract(REQUEST);
  const file = join(dir, (await cacheFiles())[0] ?? "");
  const entry = JSON.parse(await readFile(file, "utf8"));
  const corrupted = corrupt(entry);
  await writeFile(file, typeof corrupted === "string" ? corrupted : JSON.stringify(corrupted));
  return file;
}

describe("cached LLM", () => {
  describe("read-through (the default)", () => {
    it("calls the LLM on a miss and returns its result, marked live", async () => {
      const live = liveLlm();
      const llm = createCachedLlm(live, { store: fileStore() });

      const result = await llm.extract(REQUEST);

      expect(live.calls).toHaveLength(1);
      expect(result).toEqual({
        value: { answer: "yes" },
        model: "claude-haiku-5-5",
        usage: { inputTokens: 1200, outputTokens: 30 },
        latencyMs: 2500,
        cached: false,
      });
    });

    it("replays a hit without calling the LLM, with the original usage and latency, marked cached", async () => {
      await createCachedLlm(liveLlm(), { store: fileStore() }).extract(REQUEST);
      const live = liveLlm(() => "no");

      const result = await createCachedLlm(live, { store: fileStore() }).extract(REQUEST);

      expect(live.calls).toHaveLength(0);
      expect(result).toEqual({
        value: { answer: "yes" },
        model: "claude-haiku-5-5",
        usage: { inputTokens: 1200, outputTokens: 30 },
        latencyMs: 2500,
        cached: true,
      });
    });

    it("treats another sample index as a miss, so each eval run is its own sample", async () => {
      const live = liveLlm();
      const llm = createCachedLlm(live, { store: fileStore() });

      await llm.extract(REQUEST);
      await llm.extract({ ...REQUEST, sampleIndex: 0 });
      await llm.extract({ ...REQUEST, sampleIndex: 1 });

      expect(live.calls.map((call) => call.sampleIndex)).toEqual([undefined, 1]);
    });

    it("stores the key fields, value, usage, latency and recording time, sharded by key prefix", async () => {
      const llm = createCachedLlm(liveLlm(), {
        store: fileStore(),
        date: () => new Date("2026-11-22T09:00:00.000Z"),
      });

      await llm.extract({ ...REQUEST, sampleIndex: 2 });

      const files = await cacheFiles();
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^([0-9a-f]{2})\/\1[0-9a-f]{62}\.json$/);
      expect(JSON.parse(await readFile(join(dir, files[0] ?? ""), "utf8"))).toEqual({
        key: {
          model: "claude-haiku-5-5",
          system: "Answer yes or no.",
          prompt: "Is the sky blue?",
          schemaName: "yes-no",
          jsonSchema: {
            type: "object",
            properties: { answer: { enum: ["yes", "no"] } },
            required: ["answer"],
            additionalProperties: false,
          },
          maxTokens: 4096,
          sampleIndex: 2,
        },
        value: { answer: "yes" },
        usage: { inputTokens: 1200, outputTokens: 30 },
        latencyMs: 2500,
        recordedAt: "2026-11-22T09:00:00.000Z",
      });
    });
  });

  describe("live", () => {
    it("always calls the LLM and overwrites the entry", async () => {
      await createCachedLlm(
        liveLlm(() => "yes"),
        { store: fileStore() },
      ).extract(REQUEST);
      const live = liveLlm(() => "no");

      const result = await createCachedLlm(live, { store: fileStore(), mode: "live" }).extract(
        REQUEST,
      );

      expect(live.calls).toHaveLength(1);
      expect(result).toMatchObject({ value: { answer: "no" }, cached: false });
      const replayed = await createCachedLlm(liveLlm(), { store: fileStore() }).extract(REQUEST);
      expect(replayed).toMatchObject({ value: { answer: "no" }, cached: true });
      expect(await cacheFiles()).toHaveLength(1);
    });
  });

  describe("replay-only", () => {
    it("replays a hit", async () => {
      await createCachedLlm(liveLlm(), { store: fileStore() }).extract(REQUEST);

      const result = await createCachedLlm(liveLlm(), {
        store: fileStore(),
        mode: "replay-only",
      }).extract(REQUEST);

      expect(result).toMatchObject({ value: { answer: "yes" }, cached: true });
    });

    it("turns a miss into an error naming the key fields, without calling the LLM", async () => {
      const live = liveLlm();
      const llm = createCachedLlm(live, { store: fileStore(), mode: "replay-only" });

      const extract = llm.extract({
        ...REQUEST,
        system: "s".repeat(60),
        prompt: "p".repeat(61),
        sampleIndex: 2,
      });

      await expect(extract).rejects.toThrow(CacheMissError);
      await expect(extract).rejects.toMatchObject({ name: "CacheMissError" });
      await expect(extract).rejects.toThrow(
        "No cached LLM call for model claude-haiku-5-5 · schema yes-no · sample index 2 · " +
          `max tokens 4096 · system "${"s".repeat(60)}" · prompt "${"p".repeat(60)}…" (key `,
      );
      await expect(extract).rejects.toThrow(/\(key [0-9a-f]{64}\)\. Run without --replay-only/);
      expect(live.calls).toHaveLength(0);
      expect(await cacheFiles()).toEqual([]);
    });
  });

  describe("a corrupt entry", () => {
    it.each<[string, (entry: Record<string, unknown>) => unknown, string]>([
      ["is not JSON", () => '{"key":', "not valid JSON"],
      ["lacks a field", (entry) => ({ ...entry, usage: undefined }), "usage: Invalid input"],
      [
        "holds a value that fails the schema",
        (entry) => ({ ...entry, value: { answer: "maybe" } }),
        "value does not match schema 'yes-no': answer: Invalid option",
      ],
      [
        "holds key fields that do not hash to its name",
        (entry) => ({ ...entry, key: { ...(entry.key as object), prompt: "edited" } }),
        "its key fields do not hash to its file name",
      ],
    ])(
      "is an error naming the file when it %s, never a silent miss",
      async (_, corrupt, detail) => {
        const file = await corruptEntry(corrupt);
        const live = liveLlm();

        const extract = createCachedLlm(live, { store: fileStore() }).extract(REQUEST);

        await expect(extract).rejects.toThrow(CorruptCacheEntryError);
        await expect(extract).rejects.toMatchObject({ name: "CorruptCacheEntryError", file });
        await expect(extract).rejects.toThrow(`Corrupt LLM cache entry ${file}: ${detail}`);
        expect(live.calls).toHaveLength(0);
      },
    );

    it("is overwritten in live mode", async () => {
      await corruptEntry(() => "garbage");

      await createCachedLlm(liveLlm(), { store: fileStore(), mode: "live" }).extract(REQUEST);

      const replayed = await createCachedLlm(liveLlm(), {
        store: fileStore(),
        mode: "replay-only",
      }).extract(REQUEST);
      expect(replayed).toMatchObject({ value: { answer: "yes" }, cached: true });
    });
  });

  it("writes atomically: a value that fails to serialise leaves no partial file", async () => {
    const unserialisable: Llm = {
      async extract() {
        return {
          value: { answer: 10n } as never,
          model: "claude-haiku-5-5",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
          cached: false,
        };
      },
    };
    const llm = createCachedLlm(unserialisable, { store: fileStore() });

    await expect(llm.extract(REQUEST)).rejects.toThrow(/BigInt/);

    expect(await cacheFiles()).toEqual([]);
  });
});
