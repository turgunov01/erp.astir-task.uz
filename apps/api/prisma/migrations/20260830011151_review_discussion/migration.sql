-- AlterEnum
ALTER TYPE "ReviewStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "reviewId" UUID;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "deadline" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "documents_reviewId_idx" ON "documents"("reviewId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;
