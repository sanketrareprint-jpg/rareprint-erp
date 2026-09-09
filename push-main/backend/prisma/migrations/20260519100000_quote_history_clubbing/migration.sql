-- CreateTable: QuoteHistory for Rate Calculator
CREATE TABLE "QuoteHistory" (
    "id"          TEXT NOT NULL,
    "calcType"    TEXT NOT NULL,
    "customer"    TEXT,
    "job"         TEXT,
    "product"     TEXT,
    "qty"         INTEGER,
    "breakdown"   JSONB NOT NULL,
    "subtotal"    DOUBLE PRECISION NOT NULL,
    "total"       DOUBLE PRECISION NOT NULL,
    "perPiece"    DOUBLE PRECISION,
    "multiplier"  DOUBLE PRECISION NOT NULL DEFAULT 1.67,
    "inputParams" JSONB NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteHistory_createdAt_idx" ON "QuoteHistory"("createdAt");
CREATE INDEX "QuoteHistory_customer_idx" ON "QuoteHistory"("customer");
