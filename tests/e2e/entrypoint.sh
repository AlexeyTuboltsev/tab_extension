#!/bin/bash
set -e
export MOZ_HEADLESS=1
export MOZ_DISABLE_CONTENT_SANDBOX=1

# HTTP server for test pages
cd /app/extension
python3 -m http.server 8765 &

# Start Firefox
firefox --profile /app/firefox-profile --no-remote 2>&1 &

# Wait for Claudezilla socket (up to 30s)
for i in $(seq 1 30); do
  [ -S /tmp/claudezilla.sock ] && break
  sleep 1
done
[ -S /tmp/claudezilla.sock ] || { echo "FAIL: socket not found"; exit 1; }

# Wait for auth token too
for i in $(seq 1 10); do
  [ -f /tmp/claudezilla-auth.token ] && break
  sleep 1
done
[ -f /tmp/claudezilla-auth.token ] || { echo "FAIL: auth token not found"; exit 1; }

node /app/tests/e2e/test-runner.mjs
EXIT_CODE=$?
kill %1 %2 2>/dev/null || true
exit $EXIT_CODE
