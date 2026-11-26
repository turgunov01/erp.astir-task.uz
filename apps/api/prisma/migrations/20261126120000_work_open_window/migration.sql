-- AlterTable
ALTER TABLE "studio_settings" ADD COLUMN     "workOpenFrom" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "workOpenUntil" TEXT NOT NULL DEFAULT '00:00';
