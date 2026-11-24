#!/usr/bin/env bash
# Prints ticket $1 as Markdown for a factory run: its title, its body, and only the comments the
# repo owner wrote. The factory acts as the owner, so its own comments count. Everyone else's are
# left out: anyone can comment on a public repo, and a run treats this text as its spec.
# Needs GH_TOKEN, GH_REPO and OWNER.
set -euo pipefail

gh issue view "$1" --json number,title,body,comments | jq -r --arg owner "$OWNER" '
  "# #\(.number): \(.title)\n\n\(.body)\n\n## Comments by \($owner)\n\n" +
  ([.comments[] | select(.author.login == $owner) | "### \(.createdAt)\n\n\(.body)"]
    | join("\n\n")
    | if . == "" then "None." else . end)'
