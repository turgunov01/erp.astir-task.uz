-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tasks_archivedAt_idx" ON "tasks"("archivedAt");
