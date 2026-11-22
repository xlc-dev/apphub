#!/bin/sh

set -eu

base_sha=$1

apps=$(
  {
    git diff --name-only "$base_sha" HEAD -- apps |
      sed -n 's#^apps/\([^/]*\)\.json$#\1#p'

    for manifest in apps/*.json; do
      slug=$(basename "$manifest" .json)

      test -d ".generated/apps/$slug" || echo "$slug"
    done
  } | sort -u
)

if [ -n "$apps" ]; then
  set -- $apps

  pnpm run generate-catalog -- "$@"
fi

node scripts/write-snapshot.ts
