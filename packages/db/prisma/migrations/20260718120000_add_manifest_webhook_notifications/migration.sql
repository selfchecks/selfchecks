-- CreateEnum
CREATE TYPE "WebhookEndpointSource" AS ENUM ('MANIFEST', 'MANUAL');

-- AlterTable
ALTER TABLE "WebhookEndpoint"
ADD COLUMN "logicalId" TEXT,
ADD COLUMN "source" "WebhookEndpointSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "method" TEXT NOT NULL DEFAULT 'POST',
ADD COLUMN "template" TEXT,
ADD COLUMN "sendFailure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sendRecovery" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sendDegraded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sslExpiry" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WebhookEndpoint"
SET "logicalId" = "id"
WHERE "logicalId" IS NULL;

ALTER TABLE "WebhookEndpoint"
ALTER COLUMN "logicalId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Notification"
ADD COLUMN "projectId" TEXT,
ADD COLUMN "webhookEndpointId" TEXT,
ADD COLUMN "runId" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "CheckGroupWebhookEndpoint" (
    "checkGroupId" TEXT NOT NULL,
    "webhookEndpointId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckGroupWebhookEndpoint_pkey" PRIMARY KEY ("checkGroupId", "webhookEndpointId")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEndpoint_projectId_logicalId_key" ON "WebhookEndpoint"("projectId", "logicalId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_projectId_enabled_idx" ON "WebhookEndpoint"("projectId", "enabled");

-- CreateIndex
CREATE INDEX "CheckGroupWebhookEndpoint_webhookEndpointId_idx" ON "CheckGroupWebhookEndpoint"("webhookEndpointId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_webhookEndpointId_runId_event_key" ON "Notification"("webhookEndpointId", "runId", "event");

-- CreateIndex
CREATE INDEX "Notification_projectId_status_createdAt_idx" ON "Notification"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_runId_idx" ON "Notification"("runId");

-- AddForeignKey
ALTER TABLE "CheckGroupWebhookEndpoint" ADD CONSTRAINT "CheckGroupWebhookEndpoint_checkGroupId_fkey" FOREIGN KEY ("checkGroupId") REFERENCES "CheckGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckGroupWebhookEndpoint" ADD CONSTRAINT "CheckGroupWebhookEndpoint_webhookEndpointId_fkey" FOREIGN KEY ("webhookEndpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_webhookEndpointId_fkey" FOREIGN KEY ("webhookEndpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CheckRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
