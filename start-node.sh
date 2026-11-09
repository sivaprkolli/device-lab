#!/usr/bin/env bash
# Start a specific node using farm.json
# Usage: ./start-node.sh <node-id>
# Example: ./start-node.sh node-android-1
set -euo pipefail

NODE_ID="${1:-}"
if [[ -z "$NODE_ID" ]]; then
  echo "Usage: $0 <node-id>"
  echo ""
  echo "Available nodes (run 'npm run list' to see all):"
  node "$(dirname "$0")/scripts/farm-manager.js" list
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/scripts/farm-manager.js" node "$NODE_ID"
