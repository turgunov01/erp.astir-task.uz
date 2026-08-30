-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "assetId" UUID,
ADD COLUMN     "renderJobId" UUID;

-- CreateIndex
CREATE INDEX "documents_assetId_idx" ON "documents"("assetId");

-- CreateIndex
CREATE INDEX "documents_renderJobId_idx" ON "documents"("renderJobId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "render_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
