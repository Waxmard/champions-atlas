#!/bin/bash
set -euo pipefail

# Existing importer is 534 lines; lower this after splitting it.
limit="${LINE_LIMIT:-550}"
status=0
checked=0

while IFS= read -r file; do
  case "$file" in
    src/*.ts | src/*.svelte | src/*.css | scripts/*.mjs | e2e/*.ts | test/*.mjs) ;;
    *) continue ;;
  esac

  lines=$(wc -l <"$file")
  checked=$((checked + 1))
  if ((lines > limit)); then
    printf 'LINE LIMIT: %s has %d lines (max %d)\n' "$file" "$lines" "$limit" >&2
    status=1
  fi
done < <(git ls-files)

((status == 0)) || exit 1
printf 'line-limit OK (<= %d lines): %d files checked\n' "$limit" "$checked"
