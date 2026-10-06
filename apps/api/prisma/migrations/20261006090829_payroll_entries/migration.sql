-- CreateEnum
CREATE TYPE "PayrollEntryType" AS ENUM ('ADVANCE', 'BONUS', 'PENALTY', 'LATENESS', 'DEDUCTION', 'OTHER_ACCRUAL');

-- CreateEnum
CREATE TYPE "PayrollEntryStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollEntrySource" AS ENUM ('MANUAL', 'TIMESHEET', 'EXTERNAL');

-- CreateTable
CREATE TABLE "payroll_entries" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "PayrollEntryType" NOT NULL,
    "status" "PayrollEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "date" DATE NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "lateMinutes" INTEGER,
    "reason" TEXT,
    "source" "PayrollEntrySource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "createdById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salaries" (
    "employeeId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("employeeId")
);

-- CreateIndex
CREATE INDEX "payroll_entries_employeeId_period_idx" ON "payroll_entries"("employeeId", "period");

-- CreateIndex
CREATE INDEX "payroll_entries_period_idx" ON "payroll_entries"("period");

-- CreateIndex
CREATE INDEX "payroll_entries_status_idx" ON "payroll_entries"("status");

-- CreateIndex
CREATE INDEX "payroll_entries_type_idx" ON "payroll_entries"("type");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_source_externalId_key" ON "payroll_entries"("source", "externalId");

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
