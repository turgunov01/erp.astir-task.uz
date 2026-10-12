-- AlterTable
ALTER TABLE "studio_settings" ADD COLUMN     "themeColorMode" TEXT NOT NULL DEFAULT 'light',
ADD COLUMN     "themeFont" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "themeFontSize" INTEGER NOT NULL DEFAULT 16,
ADD COLUMN     "themePrimary" TEXT,
ADD COLUMN     "themeRadius" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "themeSignal" TEXT;

