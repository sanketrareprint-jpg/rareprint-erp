CREATE TABLE "BusinessRule" (
    "id" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "testedBy" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessRule_ruleCode_key" ON "BusinessRule"("ruleCode");
CREATE INDEX "BusinessRule_module_idx" ON "BusinessRule"("module");
CREATE INDEX "BusinessRule_active_idx" ON "BusinessRule"("active");
