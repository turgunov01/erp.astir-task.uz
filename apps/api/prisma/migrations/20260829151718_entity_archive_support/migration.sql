-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "episodes" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "render_jobs" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "revisions" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "scenes" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "shots" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "assets_archivedAt_idx" ON "assets"("archivedAt");

-- CreateIndex
CREATE INDEX "clients_archivedAt_idx" ON "clients"("archivedAt");

-- CreateIndex
CREATE INDEX "departments_archivedAt_idx" ON "departments"("archivedAt");

-- CreateIndex
CREATE INDEX "documents_archivedAt_idx" ON "documents"("archivedAt");

-- CreateIndex
CREATE INDEX "employees_archivedAt_idx" ON "employees"("archivedAt");

-- CreateIndex
CREATE INDEX "episodes_archivedAt_idx" ON "episodes"("archivedAt");

-- CreateIndex
CREATE INDEX "projects_archivedAt_idx" ON "projects"("archivedAt");

-- CreateIndex
CREATE INDEX "render_jobs_archivedAt_idx" ON "render_jobs"("archivedAt");

-- CreateIndex
CREATE INDEX "reviews_archivedAt_idx" ON "reviews"("archivedAt");

-- CreateIndex
CREATE INDEX "revisions_archivedAt_idx" ON "revisions"("archivedAt");

-- CreateIndex
CREATE INDEX "scenes_archivedAt_idx" ON "scenes"("archivedAt");

-- CreateIndex
CREATE INDEX "shots_archivedAt_idx" ON "shots"("archivedAt");
