import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./generate.ts", import.meta.url));

describe("scripts/generate.ts, run as a command", () => {
  it("prints the usage to stderr and exits 2 for an unknown subcommand", () => {
    const { status, stdout, stderr } = spawnSync("npx", ["tsx", SCRIPT, "nope"], {
      encoding: "utf8",
    });
    expect({ status, stdout, stderr }).toEqual({
      status: 2,
      stdout: "",
      stderr: "usage: npm run generate -- ndas\n",
    });
  });
});
