#!/bin/bash
# Fetch the exact upstream commits listed in engine/upstream.lock into engine/.upstream/.
set -euo pipefail

engine_dir="$(cd "$(dirname "$0")/.." && pwd)"
upstream="$engine_dir/.upstream"
mkdir -p "$upstream"

grep -vE '^\s*(#|$)' "$engine_dir/upstream.lock" | while read -r name commit url _licence; do
  dir="$upstream/$name"
  if [ ! -d "$dir/.git" ]; then
    git init -q "$dir"
    git -C "$dir" remote add origin "$url"
  fi
  if ! git -C "$dir" cat-file -e "$commit^{commit}" 2>/dev/null; then
    echo "===> Fetching $name @ $commit"
    git -C "$dir" fetch -q --depth 1 origin "$commit"
  fi
  git -C "$dir" checkout -q --detach "$commit"
  actual="$(git -C "$dir" rev-parse HEAD)"
  if [ "$actual" != "$commit" ]; then
    echo "ERROR: $name is at $actual, expected $commit" >&2
    exit 1
  fi
  echo "ok   $name @ $commit"
done
