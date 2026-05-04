#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="$(cd "$(dirname "$0")/.." && pwd)"
NODE_PATH="$(command -v node)"
HOME_DIR="$HOME"
PLIST_DST="$HOME_DIR/Library/LaunchAgents/com.aol.daemon.plist"
TEMPLATE="$REPO_PATH/service/com.aol.daemon.plist.template"

if [ ! -f "$REPO_PATH/dist/daemon/index.js" ]; then
  echo "[aol] dist/daemon/index.js not found — running pnpm build first..."
  (cd "$REPO_PATH" && pnpm build)
fi

mkdir -p "$HOME_DIR/.aol"
mkdir -p "$HOME_DIR/Library/LaunchAgents"

sed \
  -e "s|{{NODE_PATH}}|$NODE_PATH|g" \
  -e "s|{{REPO_PATH}}|$REPO_PATH|g" \
  -e "s|{{HOME}}|$HOME_DIR|g" \
  "$TEMPLATE" > "$PLIST_DST"

# Unload first if already loaded so we pick up changes
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load -w "$PLIST_DST"

echo "[aol] launchd agent installed at $PLIST_DST"
echo "[aol] daemon should now be running and will start at login."
echo "[aol] check: curl -s http://127.0.0.1:3312/api/health"
