import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkContext } from "./check-context";

const FIXTURES = fileURLToPath(new URL("./fixtures/context/", import.meta.url));

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "check-context-"));
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

/** The JSON a PostToolUse hook receives on stdin, pointing at a fixture transcript. */
function hookInput(transcript: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    session_id: "session-1",
    transcript_path: resolve(FIXTURES, transcript),
    cwd: "/repo",
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    tool_use_id: "toolu_1",
    ...overrides,
  });
}

/** A one-line transcript: a main-thread assistant message using `tokens` of context. */
function transcriptAt(tokens: number): string {
  const path = join(stateDir, `transcript-${tokens}.jsonl`);
  const usage = {
    input_tokens: 2,
    cache_read_input_tokens: tokens - 1_002,
    cache_creation_input_tokens: 1_000,
  };
  writeFileSync(
    path,
    JSON.stringify({ type: "assistant", isSidechain: false, message: { usage } }),
  );
  return path;
}

function at(tokens: number): string {
  return checkContext(hookInput(transcriptAt(tokens)), stateDir);
}

function check(transcript: string, sessionId = "session-1"): string {
  return checkContext(hookInput(transcript, { session_id: sessionId }), stateDir);
}

function notice(output: string): string {
  return JSON.parse(output).hookSpecificOutput.additionalContext;
}

describe("check-context", () => {
  it("adds nothing below 100k", () => {
    expect(checkContext(hookInput("transcript-40k.jsonl"), stateDir)).toBe("");
  });

  it("past 100k, tells the agent to stop now if the rest of the ticket won't fit", () => {
    const output = JSON.parse(checkContext(hookInput("transcript-120k.jsonl"), stateDir));

    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "Context is at 120k of ~150k. If the rest of the ticket won't fit, stop now and write `blocked.md`.",
      },
    });
  });

  it("past 150k, tells the agent it is over the budget and to stop now", () => {
    expect(notice(checkContext(hookInput("transcript-160k.jsonl"), stateDir))).toBe(
      "Context is at 160k, over the ~150k budget. Stop now and write `blocked.md`.",
    );
  });

  it("ignores subagent messages, even larger ones written after the main thread's", () => {
    expect(checkContext(hookInput("transcript-subagent.jsonl"), stateDir)).toBe("");
  });

  describe("never breaks a run", () => {
    it("adds nothing when the transcript can't be read", () => {
      expect(checkContext(hookInput("no-such-transcript.jsonl"), stateDir)).toBe("");
    });

    it("adds nothing when the hook input isn't JSON", () => {
      expect(checkContext("not json", stateDir)).toBe("");
    });
  });

  describe("gives each notice at most once per session", () => {
    it("gives the 100k notice once", () => {
      expect(check("transcript-120k.jsonl")).not.toBe("");
      expect(check("transcript-120k.jsonl")).toBe("");
    });

    it("gives the 150k notice once, after the 100k one", () => {
      check("transcript-120k.jsonl");

      expect(notice(check("transcript-160k.jsonl"))).toContain("over the ~150k budget");
      expect(check("transcript-160k.jsonl")).toBe("");
    });

    it("skips the 100k notice once the 150k one is given", () => {
      check("transcript-160k.jsonl");

      expect(check("transcript-120k.jsonl")).toBe("");
    });

    it("counts each session on its own", () => {
      check("transcript-120k.jsonl", "session-1");

      expect(check("transcript-120k.jsonl", "session-2")).not.toBe("");
    });
  });

  it("adds nothing to a subagent's tool calls, and saves the notice for the main thread", () => {
    expect(checkContext(hookInput("transcript-120k.jsonl", { agent_id: "a1b2c3" }), stateDir)).toBe(
      "",
    );
    expect(checkContext(hookInput("transcript-120k.jsonl"), stateDir)).not.toBe("");
  });

  it("answers the hook event it was called for", () => {
    const output = checkContext(
      hookInput("transcript-120k.jsonl", { hook_event_name: "PostToolUseFailure" }),
      stateDir,
    );

    expect(JSON.parse(output).hookSpecificOutput.hookEventName).toBe("PostToolUseFailure");
  });

  describe("thresholds", () => {
    it("adds nothing at 99,999", () => {
      expect(at(99_999)).toBe("");
    });

    it("gives the 100k notice at exactly 100,000", () => {
      expect(notice(at(100_000))).toBe(
        "Context is at 100k of ~150k. If the rest of the ticket won't fit, stop now and write `blocked.md`.",
      );
    });

    it("counts exactly 150,000 as within the budget, as the workflow's peak-context line does", () => {
      expect(notice(at(150_000))).toContain("of ~150k");
    });

    it("gives the 150k notice at 150,001", () => {
      expect(notice(at(150_001))).toContain("150k, over the ~150k budget");
    });
  });

  it.each([
    { session_id: ".." },
    { session_id: "a.b" },
    { session_id: "a/b" },
    { session_id: undefined },
  ])("adds nothing without a session id it can safely file notices under (%o)", (overrides) => {
    expect(checkContext(hookInput("transcript-120k.jsonl", overrides), stateDir)).toBe("");
  });
});
