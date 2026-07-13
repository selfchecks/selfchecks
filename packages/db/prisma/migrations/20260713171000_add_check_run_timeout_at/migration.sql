ALTER TABLE "CheckRun" ADD COLUMN "timeoutAt" TIMESTAMP(3);

CREATE INDEX "CheckRun_status_timeoutAt_idx" ON "CheckRun"("status", "timeoutAt");
