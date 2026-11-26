import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "./json";

const schema = z.object({ name: z.string().min(1), tags: z.array(z.string()) });

let dir: string;

describe("readJson", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "json-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a file that matches the schema", async () => {
    await writeFile(join(dir, "a.json"), JSON.stringify({ name: "a", tags: ["x"] }));
    expect(await readJson(join(dir, "a.json"), schema, "thing a.json")).toEqual({
      name: "a",
      tags: ["x"],
    });
  });

  it("names the file, then each issue's path and message", async () => {
    await writeFile(join(dir, "a.json"), JSON.stringify({ name: "", tags: [1] }));
    await expect(readJson(join(dir, "a.json"), schema, "thing a.json")).rejects.toThrow(
      "Invalid thing a.json: name: Too small: expected string to have >=1 characters; tags.0: Invalid input: expected string, received number.",
    );
  });
});
