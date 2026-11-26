import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The implementer's context check: a PostToolUse hook (`.github/factory/implement-settings.json`)
 * that tells the agent its context size once it nears the Definition of done's ~150k budget.
 * See docs/agents/factory.md.
 */

/** Past this, the agent is told to stop if the rest of the ticket won't fit. */
const WARN_AT = 100_000;

/** The Definition of done's limit on one session's context. */
const BUDGET = 150_000;

type Notice = "warn" | "over";

interface HookInput {
  session_id?: unknown;
  transcript_path?: unknown;
  hook_event_name?: unknown;
  /** Present only when the hook fires from within a subagent. */
  agent_id?: unknown;
}

interface Usage {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * The main thread's current context: input + cache-read + cache-creation tokens on the latest
 * main-thread assistant message in a session transcript. Subagent messages carry
 * `isSidechain: true`; Claude Code writes them to their own files, but they're skipped here too.
 */
export function mainThreadContext(transcript: string): number | undefined {
  const lines = transcript.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const entry = parseLine(lines[i] as string);
    const usage: Usage | undefined = entry?.message?.usage;
    if (entry?.type === "assistant" && entry.isSidechain !== true && usage) {
      return (
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0)
      );
    }
  }
  return undefined;
}

/** A transcript line, or undefined for a blank or partly written one. */
function parseLine(line: string) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function noticeDue(context: number): Notice | undefined {
  if (context > BUDGET) return "over";
  if (context >= WARN_AT) return "warn";
  return undefined;
}

function noticeText(notice: Notice, context: number): string {
  const k = Math.floor(context / 1000);
  return notice === "over"
    ? `Context is at ${k}k, over the ~150k budget. Stop now and write \`blocked.md\`.`
    : `Context is at ${k}k of ~150k. If the rest of the ticket won't fit, stop now and write \`blocked.md\`.`;
}

/** The notices a session has had, read from its state file. */
function givenNotices(stateFile: string): Notice[] {
  try {
    return JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {
    return [];
  }
}

/** Records `notice` as given to the session, unless it already was: true if this is its first time. */
function claimNotice(notice: Notice, stateFile: string): boolean {
  const given = givenNotices(stateFile);
  if (given.includes(notice)) return false;
  // The 150k notice supersedes the 100k one, so a session never gets the 100k one after it.
  const nowGiven: Notice[] = notice === "over" ? ["warn", "over"] : [...given, notice];
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(nowGiven));
  return true;
}

/**
 * Given a hook's JSON input, the hook's JSON output when a notice is due, or "" when not.
 * With a `stateDir`, each notice is given at most once per session; without one (the demo),
 * every call past a threshold gives its notice. Anything it can't read means no notice: the
 * check never breaks a run.
 */
export function checkContext(input: string, stateDir?: string): string {
  try {
    const hook: HookInput = JSON.parse(input);
    if (hook.agent_id !== undefined) return "";
    if (typeof hook.session_id !== "string" || !/^[\w-]+$/.test(hook.session_id)) return "";
    const context = mainThreadContext(readFileSync(hook.transcript_path as string, "utf8"));
    const notice = context === undefined ? undefined : noticeDue(context);
    if (notice === undefined || context === undefined) return "";
    if (stateDir !== undefined && !claimNotice(notice, join(stateDir, `${hook.session_id}.json`))) {
      return "";
    }

    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: hook.hook_event_name,
        additionalContext: noticeText(notice, context),
      },
    });
  } catch {
    return "";
  }
}

// The hook passes `--once-per-session`; the demo leaves it off, so it gives its notice every time.
// Stryker disable all: entry block, unreachable in-process
if (import.meta.main) {
  const stateDir = process.argv.includes("--once-per-session")
    ? join(tmpdir(), "ladder-context-check")
    : undefined;
  const output = checkContext(readFileSync(0, "utf8"), stateDir);
  if (output) process.stdout.write(`${output}\n`);
}
// Stryker restore all
