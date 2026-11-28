#!/usr/bin/env bash
# Prints the tickets PR $1 closes, each through ticket.sh, for a run that needs the PR's spec: the
# review and the fix. A PR that closes no ticket gets a line saying there is no spec.
# Needs GH_TOKEN, GH_REPO and OWNER.
set -euo pipefail

issues=$(gh pr view "$1" --json closingIssuesReferences --jq '.closingIssuesReferences[].number')
if [ -z "$issues" ]; then
  echo "This PR closes no ticket, so there is no spec: skip the Spec axis."
  exit 0
fi
for issue in $issues; do
  bash "$(dirname "$0")/ticket.sh" "$issue"
  printf '\n\n'
done
