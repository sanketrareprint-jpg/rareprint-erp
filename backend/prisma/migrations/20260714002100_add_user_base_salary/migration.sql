-- Fixed monthly base salary per user, editable by admin only, shown alongside
-- commission in the new self-service "Salary & Commission" view.

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "baseSalary" DECIMAL(12,2);
