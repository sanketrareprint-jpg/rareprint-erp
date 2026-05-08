-- Enum value only (no UPDATE here). PostgreSQL does not allow using a new enum value
-- in the same transaction that adds it (55P04).
DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_ACCOUNTS';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
