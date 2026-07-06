-- CreateEnum
CREATE TYPE "TestSessionKind" AS ENUM ('TEST', 'TRIGGER');

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN "kind" "TestSessionKind" NOT NULL DEFAULT 'TRIGGER',
ADD COLUMN "targetUrl" TEXT;

-- CreateIndex
CREATE INDEX "TestSession_kind_createdAt_idx" ON "TestSession"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "CheckRun_testSessionId_status_createdAt_idx" ON "CheckRun"("testSessionId", "status", "createdAt");
