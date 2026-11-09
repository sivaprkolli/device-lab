#!/usr/bin/env bash
# Start the hub using farm.json
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/scripts/farm-manager.js" hub
