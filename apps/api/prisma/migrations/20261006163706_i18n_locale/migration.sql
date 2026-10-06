-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ru', 'uz', 'en', 'tr');

-- AlterTable
ALTER TABLE "studio_settings" ADD COLUMN     "defaultLocale" "Locale" NOT NULL DEFAULT 'ru';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" "Locale";
