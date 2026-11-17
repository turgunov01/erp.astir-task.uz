-- «Пауза» / «Продолжить смену»: the running pause and the finished ones,
-- which are taken off the day's worked time.
ALTER TABLE "attendance_days" ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "pausedMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pauseCount" INTEGER NOT NULL DEFAULT 0;
