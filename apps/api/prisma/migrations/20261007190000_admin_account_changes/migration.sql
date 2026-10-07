-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailChangedAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
