#!/bin/sh
# Copies config.js + widget.js into Scriptable's iCloud folder, keeping the
# script's Scriptable header (icon color/glyph), so it syncs to the phone.
# Redeploy the Apps Script (doGet.js) first if the payload changed.
set -eu

SCRIPTABLE_DIR="$HOME/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents"
TARGET="$SCRIPTABLE_DIR/${1:-Top5Expenses}.js"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$REPO_DIR/config.js"
SOURCE="$REPO_DIR/widget.js"

if [ ! -f "$TARGET" ]; then
  echo "Scriptable script not found: $TARGET" >&2
  exit 1
fi
if [ ! -f "$CONFIG" ]; then
  echo "Missing $CONFIG (copy config.example.js and set API_URL)" >&2
  exit 1
fi

TMP="$(mktemp)"
head -3 "$TARGET" > "$TMP"
cat "$CONFIG" "$SOURCE" >> "$TMP"
mv "$TMP" "$TARGET"
echo "Deployed widget.js -> $TARGET"
