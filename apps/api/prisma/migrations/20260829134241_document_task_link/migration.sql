-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "taskId" UUID;

-- CreateIndex
CREATE INDEX "documents_taskId_idx" ON "documents"("taskId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
