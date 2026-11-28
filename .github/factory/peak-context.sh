#!/usr/bin/env bash
# Appends a run's peak context to $2, a Markdown file for the PR body, read from $1, the run's
# `claude --output-format stream-json` transcript. Does nothing when $2 doesn't exist: the run
# handed back with blocked.md instead.
#
# Claude can't see its own context size, so the Definition of done's "fits one session" item is
# measured here: the largest prompt the main thread sent, cache included. Subagent messages carry a
# parent_tool_use_id, and are left out.
set -euo pipefail

transcript=$1
body=$2
[ -f "$body" ] || exit 0
peak=$(jq -s '[.[] | select(.type == "assistant" and .parent_tool_use_id == null)
  | .message.usage | (.input_tokens // 0) + (.cache_read_input_tokens // 0)
  + (.cache_creation_input_tokens // 0)] | max // 0' "$transcript")
verdict="within the Definition of done's ~150k limit"
[ "$peak" -le 150000 ] || verdict="over the Definition of done's ~150k limit"
printf '\n\n**Peak context:** %sk tokens, %s.\n' "$((peak / 1000))" "$verdict" >> "$body"
