import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./check-context.ts", import.meta.url));
const REPO = fileURLToPath(new URL("..", import.meta.url));
const SETTINGS = join(REPO, ".github/factory/implement-settings.json");

/** A fresh session each test, so the notices given in one don't silence another. */
const sessionId = randomUUID();

afterEach(() => {
  rmSync(join(tmpdir(), "ladder-context-check", `${sessionId}.json`), { force: true });
});

/** Runs the script as the hook does: `node`, the hook's JSON on stdin, from the repo root. */
function runHook(fixture: string, overrides: Record<string, unknown> = {}) {
  const input = JSON.parse(readFileSync(join(REPO, "scripts/fixtures/context", fixture), "utf8"));
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO,
    input: JSON.stringify({ ...input, session_id: sessionId, ...overrides }),
    encoding: "utf8",
  });
}

describe("node scripts/check-context.ts", () => {
  it("prints the 150k notice for a ~160k transcript", () => {
    const { status, stdout } = runHook("hook-input-160k.json");

    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "Context is at 160k, over the ~150k budget. Stop now and write `blocked.md`.",
      },
    });
  });

  it("prints nothing for a ~40k transcript", () => {
    const { status, stdout } = runHook("hook-input-40k.json");

    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("prints nothing and exits 0 when the transcript can't be read", () => {
    const { status, stdout } = runHook("hook-input-160k.json", {
      transcript_path: "scripts/fixtures/context/missing.jsonl",
    });

    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});

describe("the implementer's settings", () => {
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));

  it.each(["PostToolUse", "PostToolUseFailure"])(
    "run the context check after every tool call (%s)",
    (event) => {
      const groups: { matcher?: string; hooks: { type: string; command: string }[] }[] =
        settings.hooks?.[event] ?? [];
      const commands = groups
        .filter((group) => group.matcher === undefined || group.matcher === "*")
        .flatMap((group) => group.hooks)
        .filter((hook) => hook.type === "command")
        .map((hook) => hook.command);

      expect(commands).toContain('node "$CLAUDE_PROJECT_DIR/scripts/check-context.ts"');
      expect(existsSync(SCRIPT)).toBe(true);
    },
  );
});
