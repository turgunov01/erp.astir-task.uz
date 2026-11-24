-- CreateTable
CREATE TABLE "payroll_payouts" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "salary" DECIMAL(14,2),
    "earned" DECIMAL(14,2),
    "workedMinutes" INTEGER NOT NULL,
    "normMinutes" INTEGER NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,
    "entryIds" UUID[],
    "note" TEXT,
    "paidById" UUID,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_payouts_employeeId_period_idx" ON "payroll_payouts"("employeeId", "period");

-- CreateIndex
CREATE INDEX "payroll_payouts_period_idx" ON "payroll_payouts"("period");

-- AddForeignKey
ALTER TABLE "payroll_payouts" ADD CONSTRAINT "payroll_payouts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payouts" ADD CONSTRAINT "payroll_payouts_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
