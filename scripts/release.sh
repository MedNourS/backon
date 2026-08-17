#!/usr/bin/env bash
# Publishes one package from this monorepo, without you having to `cd` into
# it by hand — that manual `cd` is exactly what went wrong twice: publishing
# from the repo root (no version field there) and publishing create-backon
# when the intent was to publish backon. This script picks the directory
# for you and prints the name + version it's about to publish before
# anything goes out, so a wrong-package mistake is visible before it happens
# instead of after.
#
# Usage:
#   bun run release backon
#   bun run release create-backon
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: bun run release <backon|create-backon>"
  exit 1
fi

PACKAGE="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT_DIR/packages/$PACKAGE"

if [ ! -d "$DIR" ]; then
  echo "No such package: $PACKAGE (expected $DIR to exist)"
  exit 1
fi

cd "$DIR"

NAME="$(bun -e 'console.log(require("./package.json").name)')"
VERSION="$(bun -e 'console.log(require("./package.json").version)')"

echo "== Releasing $NAME@$VERSION from packages/$PACKAGE =="
echo

echo "-- typecheck --"
bun run typecheck
echo

echo "-- test --"
bun test
echo

echo "-- pack contents (dry run) --"
bun pm pack --dry-run
echo

echo "About to publish: $NAME@$VERSION"
read -r -p "Does that name and version look right? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

bunx npm publish --access public
