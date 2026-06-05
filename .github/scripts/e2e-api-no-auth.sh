#!/usr/bin/env bash
# Scenario 3: api-no-auth — multiple endpoints, no auth
# - CRUD operations on 2 resources
# - 400 on missing required fields
# - 404 on unknown ID
# - Rate limit test
set -euo pipefail
source "$(dirname "$0")/e2e-common.sh"

PORT=4102

echo "=== E2E: api-no-auth scenario ==="

cd "$WORK_DIR"

node "$CLI" init test-api-no-auth --pm npm
cd test-api-no-auth

cat > .env <<EOF
PORT=$PORT
POSTGRES_HOST=${POSTGRES_HOST}
POSTGRES_PORT=${POSTGRES_PORT}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}_noauth
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}_noauth?schema=public
EOF

# Generate two resources from SQL
node "$CLI" generate create "CREATE TABLE products (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, price DECIMAL)"
node "$CLI" generate create "CREATE TABLE categories (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL)"

npm install --prefer-offline

# Add Prisma models manually to schema before push
cat >> prisma/schema.prisma <<'SCHEMA'

model Product {
  id    Int     @id @default(autoincrement())
  name  String
  price Decimal?
}

model Category {
  id    Int    @id @default(autoincrement())
  title String
}
SCHEMA

npx prisma db push --accept-data-loss
npm run build

PORT=$PORT node dist/main &
SERVER_PID=$!
wait_for_server $PORT

# ── Products CRUD ──────────────────────────────────────────────────────────

# Create
CREATE_RESP=$(curl -s -X POST "http://localhost:$PORT/products" \
  -H "Content-Type: application/json" -d '{"name":"Widget","price":9.99}')
echo "Create product: $CREATE_RESP"
PRODUCT_ID=$(echo "$CREATE_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

if [ -z "$PRODUCT_ID" ]; then
  echo "FAIL [create-product]: no id in response"
  exit 1
fi
echo "PASS [create-product]: id=$PRODUCT_ID"

# Get all
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/products")
assert_status "get-all-products" "200" "$STATUS"

# Get by id
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/products/$PRODUCT_ID")
assert_status "get-product-by-id" "200" "$STATUS"

# Update
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "http://localhost:$PORT/products/$PRODUCT_ID" \
  -H "Content-Type: application/json" -d '{"name":"Updated Widget"}')
assert_status "update-product" "200" "$STATUS"

# Delete
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "http://localhost:$PORT/products/$PRODUCT_ID")
assert_status "delete-product" "204" "$STATUS"

# 404 after delete
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/products/$PRODUCT_ID")
assert_status "404-after-delete" "404" "$STATUS"

# ── Validation ─────────────────────────────────────────────────────────────

malformed_test "http://localhost:$PORT/products"

# ── Rate limit ─────────────────────────────────────────────────────────────

rate_limit_test "http://localhost:$PORT/products"

kill "$SERVER_PID"
echo "=== PASS: api-no-auth scenario ==="
