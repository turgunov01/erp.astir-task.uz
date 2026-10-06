-- Finance details: expense vendor / method / primary document / VAT, payment
-- reference / fee / notes, invoice description / VAT, budget lines per
-- category, and studio overhead expenses without a project.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExpenseCategory" ADD VALUE 'OFFICE';
ALTER TYPE "ExpenseCategory" ADD VALUE 'TAXES';
ALTER TYPE "ExpenseCategory" ADD VALUE 'MARKETING';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "documentUrl" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "vatAmount" DECIMAL(14,2),
ADD COLUMN     "vendor" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "description" TEXT,
ADD COLUMN     "vatAmount" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reference" TEXT;

-- The free-text method becomes an enum. Existing words are mapped rather than
-- dropped, and anything unrecognised is kept as OTHER instead of lost.
ALTER TABLE "payments" ALTER COLUMN "method" TYPE "PaymentMethod" USING (
  CASE
    WHEN "method" IS NULL OR btrim("method") = '' THEN NULL
    -- Cyrillic capitals are spelled out: under a C collation lower() and ~*
    -- only fold ASCII.
    WHEN "method" ~* '([нН]ал|cash|naqd)' THEN 'CASH'::"PaymentMethod"
    WHEN "method" ~* '([кК]арт|card|uzcard|humo|visa|master|payme|click)' THEN 'CARD'::"PaymentMethod"
    WHEN "method" ~* '([пП]ерев|[пП]еречисл|[бБ]анк|bank|transfer|wire|swift)' THEN 'BANK_TRANSFER'::"PaymentMethod"
    ELSE 'OTHER'::"PaymentMethod"
  END
);

-- CreateTable
CREATE TABLE "project_budget_lines" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "plannedAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_budget_lines_budgetId_category_key" ON "project_budget_lines"("budgetId", "category");

-- CreateIndex
CREATE INDEX "expenses_currency_date_idx" ON "expenses"("currency", "date");

-- CreateIndex
CREATE INDEX "invoices_issuedAt_idx" ON "invoices"("issuedAt");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "payments_paidDate_idx" ON "payments"("paidDate");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- AddForeignKey
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "project_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
