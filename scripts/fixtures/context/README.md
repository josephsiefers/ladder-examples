# Context-check fixtures

Inputs for `scripts/check-context.test.ts` and `scripts/check-context.integration.test.ts`, and the ticket's demo.

- `hook-input-*.json`: the JSON a `PostToolUse` hook receives on stdin. `transcript_path` is relative, so run the demo from the repo root.
- `transcript-*.jsonl`: session transcripts, named for the main thread's latest context. `transcript-subagent.jsonl` ends with subagent messages larger than the main thread's (60k).

The transcripts follow the session file Claude Code 2.1.318 writes to `~/.claude/projects/<project>/<session id>.jsonl` (the hook's `transcript_path`), checked against a real one: each entry is one line, an assistant entry carries `message.usage`, and the main thread's entries have `isSidechain: false`. Claude Code writes a subagent's entries, with `isSidechain: true` and an `agentId`, to `<session id>/subagents/agent-<id>.jsonl`; the subagent fixture puts them inline to prove the check skips them anyway. Message content is trimmed; the check reads only `type`, `isSidechain` and `message.usage`.

This differs from the workflow's `--output-format stream-json`, where a subagent's messages are marked by a non-null `parent_tool_use_id`.
