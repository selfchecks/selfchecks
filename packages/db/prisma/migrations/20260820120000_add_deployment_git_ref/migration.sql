ALTER TABLE "Deployment" ADD COLUMN "gitRef" TEXT;

CREATE INDEX "Deployment_projectId_createdAt_idx" ON "Deployment"("projectId", "createdAt");
