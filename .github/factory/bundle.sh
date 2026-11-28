#!/usr/bin/env bash
# Bundles a build run's new commits for the publish job: bundle.sh OUT_DIR BRANCH BASE FILE...
# Writes OUT_DIR/commits.bundle with the commits on BRANCH that BASE doesn't have. Each FILE (a
# name in OUT_DIR) is one the run must have written. Run it in the build's checkout.
#
# Does nothing when the run wrote OUT_DIR/blocked.md: nothing is pushed then. Fails when a FILE is
# missing, the run left changes uncommitted, or it made no commits.
set -euo pipefail

out=$1
branch=$2
base=$3
shift 3

[ ! -f "$out/blocked.md" ] || exit 0
for file in "$@"; do
  if [ ! -f "$out/$file" ]; then
    echo "::error::The run wrote neither $file nor blocked.md."
    exit 1
  fi
done
if [ -n "$(git status --porcelain)" ]; then
  echo "::error::The run left changes uncommitted:"
  git status --short
  exit 1
fi
if [ "$(git rev-list --count "$base..$branch")" = 0 ]; then
  echo "::error::The run made no commits."
  exit 1
fi
git bundle create "$out/commits.bundle" "$branch" "^$base"
