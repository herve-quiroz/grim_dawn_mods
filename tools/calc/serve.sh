#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8001}"
DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill existing server on this port
pid=$(lsof -t -i:"$PORT" 2>/dev/null || true)
if [ -n "$pid" ]; then
  kill "$pid" 2>/dev/null || true
  sleep 0.2
fi

# Recompile
(cd "$DIR" && npx tsc)

echo "Serving $DIR on http://localhost:$PORT"
exec python3 -m http.server "$PORT" --directory "$DIR"
