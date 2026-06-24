-- Add paperType to Product. Uses exception handler so it never fails
-- even if the column already exists from a previous partial run.
DO $$
BEGIN
  BEGIN
    ALTER TABLE "Product" ADD COLUMN "paperType" TEXT;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;
END $$;
