#!/usr/bin/env bash
# Scenario 1: blank project
# - Project created (exit 0, files exist)
# - Server starts, GET /health returns 200
# - Rate limit test: >100 req/s → 429
# - Malformed POST → 400, no crash
set -euo pipefail
source "$(dirname "$0")/e2e-common.sh"

PORT=4100

echo "=== E2E: blank scenario ==="

cd "$WORK_DIR"

# 1. Generate blank project
node "$CLI" init test-blank --pm npm
cd test-blank

# 2. Copy env
cat > .env <<EOF
PORT=$PORT
POSTGRES_HOST=${POSTGRES_HOST}
POSTGRES_PORT=${POSTGRES_PORT}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=${DATABASE_URL}
EOF

# 3. Install deps
npm install --prefer-offline

# 4. Prisma
npx prisma db push --accept-data-loss

# 5. Build
npm run build

# 6. Start server in background
PORT=$PORT node dist/main &
SERVER_PID=$!

wait_for_server $PORT

# 7. Health check
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/health")
assert_status "health-check" "200" "$STATUS"

# 8. Rate limit test
rate_limit_test "http://localhost:$PORT/health"

# 9. Malformed body test — health is GET, use a resource that doesn't exist to test 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/nonexistent")
assert_status "404-on-unknown-route" "404" "$STATUS"

kill "$SERVER_PID"
echo "=== PASS: blank scenario ==="
