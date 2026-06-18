#!/usr/bin/env bash
set -euo pipefail

# Scan only tracked files to avoid noise from dependencies or generated directories.
if ! command -v git >/dev/null 2>&1; then
  echo "FAIL: git is required" >&2
  exit 1
fi

# Exclude this script (it must mention the patterns) and package-lock.json
# (npm writes upstream funding/sponsor URLs there as standard metadata).
exclude='scripts/check-tracked-no-external-repos.sh|package-lock.json'
matches="$(git ls-files | grep -v -E "${exclude}" | xargs grep -nH -E "github\.com|gitlab\.com|bitbucket\.org|git@github" || true)"

if [[ -n "${matches}" ]]; then
  echo "FAIL: external repository references found in tracked files:"
  echo "${matches}"
  exit 1
fi

echo "PASS: no external repository references found in tracked files."
