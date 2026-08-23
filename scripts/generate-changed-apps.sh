#!/bin/sh

set -eu

base_sha=$1

if ! git diff --quiet "$base_sha" HEAD -- \
  catalog/appstream.ts \
  catalog/schema.ts \
  scripts/generate-catalog.ts \
  scripts/update-releases.ts \
  scripts/releases
then
  bun run generate-catalog
  exit 0
fi

changed_apps=$(
  git diff --name-only "$base_sha" HEAD -- apps |
    sed -n 's#^apps/\([^/]*\)/app.json$#\1#p'
)

if [ -z "$changed_apps" ]; then
  exit 0
fi

set -- $changed_apps

bun run generate-catalog -- "$@"
