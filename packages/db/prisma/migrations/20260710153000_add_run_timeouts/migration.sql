ALTER TABLE "PerformanceSettings"
ADD COLUMN "queuedRunTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "runningRunTimeoutMinutes" INTEGER NOT NULL DEFAULT 120;
