#!/usr/bin/env bash
# Scenario 5: nested endpoints
# /users/:userId/subscriptions — correct param extraction and routing
set -euo pipefail
source "$(dirname "$0")/e2e-common.sh"

PORT=4104

echo "=== E2E: nested scenario ==="

cd "$WORK_DIR"

node "$CLI" init test-nested --pm npm
cd test-nested

cat > .env <<EOF
PORT=$PORT
POSTGRES_HOST=${POSTGRES_HOST}
POSTGRES_PORT=${POSTGRES_PORT}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}_nested
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}_nested?schema=public
EOF

# Parent resource
node "$CLI" generate create "CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL)"

# Nested resource
node "$CLI" generate create \
  "CREATE TABLE subscriptions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), plan VARCHAR(100) NOT NULL, user_id UUID NOT NULL)" \
  --parent user

npm install --prefer-offline

cat >> prisma/schema.prisma <<'SCHEMA'

model User {
  id   String @id @default(uuid())
  name String
  subscriptions Subscription[]
}

model Subscription {
  id     String @id @default(uuid())
  plan   String
  userId String
  user   User   @relation(fields: [userId], references: [id])
}
SCHEMA

npx prisma db push --accept-data-loss
npm run build

PORT=$PORT node dist/main &
SERVER_PID=$!
wait_for_server $PORT

# 1. Create user (top-level)
USER_RESP=$(curl -s -X POST "http://localhost:$PORT/users" \
  -H "Content-Type: application/json" -d '{"name":"Alice"}')
USER_ID=$(echo "$USER_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
  echo "FAIL [create-user]: $USER_RESP"
  exit 1
fi
echo "PASS [create-user]: id=$USER_ID"

# 2. Create subscription under user (nested route)
SUB_RESP=$(curl -s -X POST "http://localhost:$PORT/users/$USER_ID/subscriptions" \
  -H "Content-Type: application/json" -d "{\"plan\":\"pro\",\"userId\":\"$USER_ID\"}")
SUB_ID=$(echo "$SUB_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SUB_ID" ]; then
  echo "FAIL [create-subscription]: $SUB_RESP"
  exit 1
fi
echo "PASS [create-subscription under user]: id=$SUB_ID"

# 3. List subscriptions for user
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:$PORT/users/$USER_ID/subscriptions")
assert_status "list-nested" "200" "$STATUS"

# 4. Get specific nested item
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:$PORT/users/$USER_ID/subscriptions/$SUB_ID")
assert_status "get-nested-by-id" "200" "$STATUS"

# 5. Malformed parent ID should not crash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:$PORT/users/not-a-uuid/subscriptions")
if [ "$STATUS" = "500" ]; then
  echo "FAIL [bad-parent-id]: server crashed with 500"
  exit 1
fi
echo "PASS [bad-parent-id]: returned $STATUS (no crash)"

# 6. Delete subscription
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE "http://localhost:$PORT/users/$USER_ID/subscriptions/$SUB_ID")
assert_status "delete-nested" "204" "$STATUS"

kill "$SERVER_PID"
echo "=== PASS: nested scenario ==="
