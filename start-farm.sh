#!/usr/bin/env bash
# Start hub + all enabled nodes using farm.json
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/scripts/farm-manager.js" all
