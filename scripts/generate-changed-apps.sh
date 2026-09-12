#!/bin/sh

set -eu

base_sha=$1

changed_apps=$(
  git diff --name-only "$base_sha" HEAD -- apps |
    sed -n 's#^apps/\([^/]*\)\.json$#\1#p'
)

if [ -n "$changed_apps" ]; then
  set -- $changed_apps

  bun run generate-catalog -- "$@"
fi

bun scripts/write-snapshot.ts
