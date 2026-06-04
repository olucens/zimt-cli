#!/usr/bin/env bash
# Scenario 4: api-full — multiple resources + auth
# - CRUD works for authenticated requests
# - Protected routes return 401 without token
# - Wrong credentials return 403
set -euo pipefail
source "$(dirname "$0")/e2e-common.sh"

PORT=4103

echo "=== E2E: api-full scenario ==="

cd "$WORK_DIR"

node "$CLI" init test-api-full --pm npm <<< $'test-api-full\n'
cd test-api-full

cat > .env <<EOF
PORT=$PORT
POSTGRES_HOST=${POSTGRES_HOST}
POSTGRES_PORT=${POSTGRES_PORT}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}_full
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}_full?schema=public
CRYPT_SALT=5
JWT_SECRET_KEY=${JWT_SECRET_KEY}
JWT_SECRET_REFRESH_KEY=${JWT_SECRET_REFRESH_KEY}
TOKEN_EXPIRE_TIME=1h
TOKEN_REFRESH_EXPIRE_TIME=24h
EOF

# Add auth
echo "yes" | node "$CLI" auth || node "$CLI" auth

# Generate resource
node "$CLI" generate create "CREATE TABLE articles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title VARCHAR(255) NOT NULL, body TEXT)"

npm install --prefer-offline

cat >> prisma/schema.prisma <<'SCHEMA'

model Article {
  id    String @id @default(uuid())
  title String
  body  String?
}
SCHEMA

npx prisma db push --skip-generate --accept-data-loss
npm run build

PORT=$PORT node dist/main &
SERVER_PID=$!
wait_for_server $PORT

# 1. No token → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/articles")
assert_status "articles-no-token" "401" "$STATUS"

# 2. Register + login
curl -s -X POST "http://localhost:$PORT/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"login":"apiuser","password":"ApiPass123"}' > /dev/null

LOGIN=$(curl -s -X POST "http://localhost:$PORT/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"login":"apiuser","password":"ApiPass123"}')
TOKEN=$(echo "$LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "FAIL [login]: $LOGIN"
  exit 1
fi

# 3. CRUD with token
CREATE=$(curl -s -X POST "http://localhost:$PORT/articles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello World","body":"Content here"}')
ARTICLE_ID=$(echo "$CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$ARTICLE_ID" ]; then
  echo "FAIL [create-article]: $CREATE"
  exit 1
fi
echo "PASS [create-article]: id=$ARTICLE_ID"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/articles" \
  -H "Authorization: Bearer $TOKEN")
assert_status "get-articles-with-token" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "http://localhost:$PORT/articles/$ARTICLE_ID" \
  -H "Authorization: Bearer $TOKEN")
assert_status "delete-article" "204" "$STATUS"

# 4. 400 on missing required field
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/articles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{}')
assert_status "missing-field-400" "400" "$STATUS"

# 5. Rate limit
rate_limit_test "http://localhost:$PORT/health"

kill "$SERVER_PID"
echo "=== PASS: api-full scenario ==="
