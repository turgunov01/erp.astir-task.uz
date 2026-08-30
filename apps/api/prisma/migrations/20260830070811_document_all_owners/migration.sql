-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "departmentId" UUID,
ADD COLUMN     "employeeId" UUID,
ADD COLUMN     "episodeId" UUID,
ADD COLUMN     "revisionId" UUID,
ADD COLUMN     "sceneId" UUID,
ADD COLUMN     "shotId" UUID;

-- CreateIndex
CREATE INDEX "documents_episodeId_idx" ON "documents"("episodeId");

-- CreateIndex
CREATE INDEX "documents_sceneId_idx" ON "documents"("sceneId");

-- CreateIndex
CREATE INDEX "documents_shotId_idx" ON "documents"("shotId");

-- CreateIndex
CREATE INDEX "documents_revisionId_idx" ON "documents"("revisionId");

-- CreateIndex
CREATE INDEX "documents_departmentId_idx" ON "documents"("departmentId");

-- CreateIndex
CREATE INDEX "documents_employeeId_idx" ON "documents"("employeeId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "shots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
