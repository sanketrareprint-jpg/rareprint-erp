-- Forgot-password flow: tokenized reset link stored on User, mirroring the
-- existing Employee.agreementToken pattern used for HR agreements.
--
-- Written idempotently (IF NOT EXISTS) to match this repo's existing
-- repair-migration pattern.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");
