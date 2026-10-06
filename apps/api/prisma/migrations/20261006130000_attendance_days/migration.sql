-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('WEB', 'MANUAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "studio_settings" ADD COLUMN     "lateGraceMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "latePenaltyPerDay" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "latePenaltyPerMinute" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "workDayEnd" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "workDayStart" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "workWeekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" "AttendanceSource" NOT NULL DEFAULT 'WEB',
    "externalId" TEXT,
    "correctedById" UUID,
    "correctedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_days_date_idx" ON "attendance_days"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_employeeId_date_key" ON "attendance_days"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_source_externalId_key" ON "attendance_days"("source", "externalId");

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A role edited in Settings keeps its whole list in role_permissions, so new
-- compiled defaults never reach it. Bring stored rows in line with the new
-- defaults: the administrator controls attendance, and finance staff — who
-- have tasks of their own — can open "Мои задачи", where they now land.
UPDATE "role_permissions"
SET "permissions" = array_append("permissions", 'attendance:view'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'ADMIN' AND NOT ('attendance:view' = ANY("permissions"));

UPDATE "role_permissions"
SET "permissions" = array_append("permissions", 'attendance:manage'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'ADMIN' AND NOT ('attendance:manage' = ANY("permissions"));

UPDATE "role_permissions"
SET "permissions" = array_append("permissions", 'task:view:own'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'FINANCE' AND NOT ('task:view:own' = ANY("permissions"));
