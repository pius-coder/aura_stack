#!/usr/bin/env bash
# Smoke test — validates core endpoints are reachable.
# Usage: bun run smoke (or bash scripts/smoke.sh)
set -e

BASE="${APP_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" url="$2" expect="$3"
  if curl -sf "$url" | grep -q "$expect"; then
    echo "✅ $name"
    PASS=$((PASS+1))
  else
    echo "❌ $name"
    FAIL=$((FAIL+1))
  fi
}

check "Health" "$BASE/health" '"ok":true'
check "Landing" "$BASE/" "Vibe"
check "Sign-in page" "$BASE/sign-in" "Connexion"
check "Sign-up page" "$BASE/sign-up" "Inscription"
check "Aura manifest" "$BASE/aura/_manifest" "operations"

# Evolution API
EVO="${EVOLUTION_API_BASE_URL:-https://evo-admin.globalimex.online}"
KEY="${EVOLUTION_API_KEY:-RPCJl6kIyBay1tOlOu7G1kbzb8wjjXOM}"
INST="${EVOLUTION_API_INSTANCE_ID:-test}"
check "Evolution API" "$EVO/instance/connectionState/$INST" '"state":"open"'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
