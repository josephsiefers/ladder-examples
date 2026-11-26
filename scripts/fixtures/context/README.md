# Context-check fixtures

Inputs for `scripts/check-context.test.ts` and `scripts/check-context.integration.test.ts`, and the ticket's demo.

- `hook-input-*.json`: the JSON a `PostToolUse` hook receives on stdin. `transcript_path` is relative, so run the demo from the repo root.
- `transcript-*.jsonl`: session transcripts, named for the main thread's latest context.
- `transcript-subagent.jsonl` and `transcript-subagent/subagents/agent-a1b2c3d4e5f6a7b8c.jsonl`: a session whose main thread (60k) starts a subagent that goes on to 120k, then 170k. The subagent's entries are in its own file.

## Checked against real sessions

The layout and fields are taken from live Claude Code 2.1.318 sessions (`claude -p`, with a hook that saves its stdin), one of which started a subagent:

- The hook's `transcript_path` is the session file, `~/.claude/projects/<project>/<session id>.jsonl`, even when the hook fires inside a subagent. There the input also has `agent_id` and `agent_type`; on the main thread it has neither.
- Each entry is one line. An assistant entry carries `message.usage` with `input_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens`. The file also has `attachment`, `last-prompt` and other lines without usage.
- In the session file, every `user` and `assistant` entry has `isSidechain: false`. A subagent's entries go to `<session id>/subagents/agent-<agent id>.jsonl`, each with `isSidechain: true` and `agentId`; the session file has only the main thread's `Agent` tool call and its result.

Message content is trimmed; the check reads only `type`, `isSidechain` and `message.usage`. It never opens the subagent file, and it still skips any `isSidechain: true` entry in the session file (a unit test covers that).

This differs from the workflow's `--output-format stream-json`, where a subagent's messages are marked by a non-null `parent_tool_use_id`.
