-- Screen-lock PIN: the lock icon and «Пауза» lock the screen until the PIN
-- (or the account password) is entered.
ALTER TABLE "users" ADD COLUMN "pinHash" TEXT,
ADD COLUMN "screenLockedAt" TIMESTAMP(3);
