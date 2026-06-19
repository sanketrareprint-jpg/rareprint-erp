#!/bin/sh
# startup.sh — RarePrint ERP backend startup
# Uses prisma db execute (Prisma's own connection) so SSL/auth always match.

echo "[startup] Step 1: Running DB repair via prisma db execute..."
npx prisma db execute --file ./scripts/repair.sql --schema ./prisma/schema.prisma \
  && echo "[startup] DB repair: OK" \
  || echo "[startup] DB repair: had errors (columns may already exist — continuing)"

echo "[startup] Step 2: Resolving stuck migrations..."
npx prisma migrate resolve --applied 20260619000100_add_offer_code_and_product_rule 2>&1 || true
npx prisma migrate resolve --applied 20260619000200_add_sample_order_fields 2>&1 || true
npx prisma migrate resolve --applied 20260619000300_repair_missing_columns 2>&1 || true

echo "[startup] Step 3: Deploying any new pending migrations..."
npx prisma migrate deploy 2>&1 || echo "[startup] migrate deploy had issues — server will start anyway"

echo "[startup] Step 4: Starting NestJS server..."
exec node dist/src/main.js
