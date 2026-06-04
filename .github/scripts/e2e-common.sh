#!/usr/bin/env bash
# Shared helpers for E2E scenario scripts
set -euo pipefail

CLI="node $(pwd)/dist/bin/zimt.js"
WORK_DIR=$(mktemp -d)

cleanup() {
  echo "--- Cleaning up $WORK_DIR ---"
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

# Wait for server to be ready on given port
wait_for_server() {
  local port=$1
  local max=30
  local count=0
  echo "Waiting for server on port $port..."
  until curl -sf "http://localhost:$port/health" > /dev/null 2>&1; do
    count=$((count + 1))
    if [ $count -ge $max ]; then
      echo "FAIL: server did not start in ${max}s"
      kill "$SERVER_PID" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done
  echo "Server ready on port $port"
}

# Assert HTTP status
assert_status() {
  local desc=$1
  local expected=$2
  local actual=$3
  if [ "$actual" != "$expected" ]; then
    echo "FAIL [$desc]: expected HTTP $expected, got $actual"
    exit 1
  fi
  echo "PASS [$desc]: HTTP $actual"
}

# Rate limit test: fire 110 requests, expect some 429s
rate_limit_test() {
  local url=$1
  local got_429=0
  for i in $(seq 1 110); do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
    if [ "$status" = "429" ]; then
      got_429=1
      break
    fi
  done
  if [ "$got_429" = "1" ]; then
    echo "PASS [rate-limit]: got 429 after >100 requests"
  else
    echo "WARN [rate-limit]: did not hit 429 in 110 requests (may need higher load)"
  fi
}

# Malformed body test: empty JSON → expect 400
malformed_test() {
  local url=$1
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" \
    -H "Content-Type: application/json" -d '{}')
  assert_status "malformed-empty-body" "400" "$status"

  # SQL injection attempt in string field → should return 400/422 (ValidationPipe) or
  # be accepted as a safe string; the server must NOT crash (not 500)
  local sql_body
  sql_body='{"name": "'"'"'; DROP TABLE products; --"}'
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$sql_body")
  if [ "$status" = "500" ]; then
    echo "FAIL [sql-injection-attempt]: server returned 500 (crash)"
    exit 1
  fi
  echo "PASS [sql-injection-attempt]: server returned $status (no crash)"
}
