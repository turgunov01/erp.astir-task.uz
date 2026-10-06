-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('BUTTON', 'AUTO');

-- AlterTable
ALTER TABLE "attendance_days" ADD COLUMN     "checkInMethod" "AttendanceMethod",
ADD COLUMN     "checkOutMethod" "AttendanceMethod";

-- Days captured before the button existed took their arrival from the first
-- activity and their departure from the last one: mark them as such, so the
-- board shows them as "seen, not checked in" rather than as a press.
UPDATE "attendance_days" SET "checkInMethod" = 'AUTO' WHERE "checkInAt" IS NOT NULL;
UPDATE "attendance_days" SET "checkOutMethod" = 'AUTO' WHERE "checkOutAt" IS NOT NULL;

-- Every member of staff may now mark their own arrival and departure. A role
-- edited in Settings keeps its whole list in role_permissions, so new
-- compiled defaults never reach it: add the right to every stored staff
-- role. Client accounts are customers, not staff, and never get it.
UPDATE "role_permissions"
SET "permissions" = array_append("permissions", 'attendance:self'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" <> 'CLIENT' AND NOT ('attendance:self' = ANY("permissions"));
