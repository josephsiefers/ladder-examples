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

/** A session id no other run uses; `afterEach` clears the notices filed under it. */
const sessionId = randomUUID();

afterEach(() => {
  rmSync(join(tmpdir(), "ladder-context-check", `${sessionId}.json`), { force: true });
});

/** The flag the implementer's settings pass. */
const HOOK_ARGS = ["--once-per-session"];

/** Runs the script as the hook does: `node`, the hook's JSON on stdin, from the repo root. */
function runHook(fixture: string, overrides: Record<string, unknown> = {}, args = HOOK_ARGS) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO,
    input: JSON.stringify({ ...readFixture(fixture), session_id: sessionId, ...overrides }),
    encoding: "utf8",
  });
}

/** The demo, as written: the 160k fixture's input piped in unchanged, with no flag. */
function runDemo() {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO,
    input: readFileSync(join(REPO, "scripts/fixtures/context/hook-input-160k.json")),
    encoding: "utf8",
  });
}

function readFixture(fixture: string) {
  return JSON.parse(readFileSync(join(REPO, "scripts/fixtures/context", fixture), "utf8"));
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

  it("with --once-per-session, prints each notice once", () => {
    runHook("hook-input-160k.json");

    expect(runHook("hook-input-160k.json").stdout).toBe("");
  });

  it("as the demo runs it (the fixture as is, no flag), prints the 150k notice every time", () => {
    expect(runDemo().stdout).toContain("over the ~150k budget");
    expect(runDemo().stdout).toContain("over the ~150k budget");
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

      expect(commands).toContain(
        'node "$CLAUDE_PROJECT_DIR/scripts/check-context.ts" --once-per-session',
      );
      expect(existsSync(SCRIPT)).toBe(true);
    },
  );
});
