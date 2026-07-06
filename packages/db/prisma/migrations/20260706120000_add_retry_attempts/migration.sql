-- AlterTable
ALTER TABLE "Check" ADD COLUMN "retryStrategy" JSONB;

-- AlterTable
ALTER TABLE "CheckRun" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "retryGroupId" TEXT;

-- CreateIndex
CREATE INDEX "CheckRun_retryGroupId_attempt_idx" ON "CheckRun"("retryGroupId", "attempt");
