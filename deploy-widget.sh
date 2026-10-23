#!/bin/sh
# Copies widget.js into Scriptable's iCloud folder, keeping the script's
# Scriptable header (icon color/glyph), so it syncs to the phone.
# Redeploy the Apps Script (doGet.js) first if the payload changed.
set -eu

SCRIPTABLE_DIR="$HOME/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents"
TARGET="$SCRIPTABLE_DIR/${1:-Top5Expenses}.js"
SOURCE="$(cd "$(dirname "$0")" && pwd)/widget.js"

if [ ! -f "$TARGET" ]; then
  echo "Scriptable script not found: $TARGET" >&2
  exit 1
fi

TMP="$(mktemp)"
head -3 "$TARGET" > "$TMP"
cat "$SOURCE" >> "$TMP"
mv "$TMP" "$TARGET"
echo "Deployed widget.js -> $TARGET"
