#!/usr/bin/env bash
# Scenario 2: auth-only
# - Register user, login, get JWT, access protected route
# - Wrong credentials → 403, no token → 401
set -euo pipefail
source "$(dirname "$0")/e2e-common.sh"

PORT=4101

echo "=== E2E: auth-only scenario ==="

cd "$WORK_DIR"

node "$CLI" init test-auth --pm npm <<< $'test-auth\n'
cd test-auth

cat > .env <<EOF
PORT=$PORT
POSTGRES_HOST=${POSTGRES_HOST}
POSTGRES_PORT=${POSTGRES_PORT}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}_auth
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}_auth?schema=public
CRYPT_SALT=5
JWT_SECRET_KEY=${JWT_SECRET_KEY}
JWT_SECRET_REFRESH_KEY=${JWT_SECRET_REFRESH_KEY}
TOKEN_EXPIRE_TIME=1h
TOKEN_REFRESH_EXPIRE_TIME=24h
EOF

# Add auth module
echo "yes" | node "$CLI" auth || node "$CLI" auth

npm install --prefer-offline
npx prisma db push --skip-generate --accept-data-loss
npm run build

PORT=$PORT node dist/main &
SERVER_PID=$!
wait_for_server $PORT

# 1. Health check (public)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/health")
assert_status "health-public" "200" "$STATUS"

# 2. Protected route without token → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/user")
assert_status "protected-no-token" "401" "$STATUS"

# 3. Register user
BODY='{"login":"testuser","password":"TestPass123"}'
SIGNUP=$(curl -s -X POST "http://localhost:$PORT/auth/signup" \
  -H "Content-Type: application/json" -d "$BODY")
echo "Signup response: $SIGNUP"

# 4. Login → get JWT
LOGIN_RESP=$(curl -s -X POST "http://localhost:$PORT/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"login":"testuser","password":"TestPass123"}')
ACCESS_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
echo "Access token obtained: ${ACCESS_TOKEN:0:20}..."

if [ -z "$ACCESS_TOKEN" ]; then
  echo "FAIL [login]: no accessToken in response: $LOGIN_RESP"
  exit 1
fi
echo "PASS [login]: JWT received"

# 5. Wrong password → 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/auth/login" \
  -H "Content-Type: application/json" -d '{"login":"testuser","password":"wrong"}')
assert_status "wrong-password" "403" "$STATUS"

# 6. Malformed signup → 400
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/auth/signup" \
  -H "Content-Type: application/json" -d '{}')
assert_status "malformed-signup" "400" "$STATUS"

# 7. Refresh token
REFRESH_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
assert_status "refresh-token" "200" "$STATUS"

kill "$SERVER_PID"
echo "=== PASS: auth-only scenario ==="
