-- CreateTable
CREATE TABLE "ApplicationDeployment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "commitSha" TEXT,
    "repository" TEXT,
    "pipelineUrl" TEXT,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationDeployment_projectId_environment_deployedAt_idx" ON "ApplicationDeployment"("projectId", "environment", "deployedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDeployment_projectId_environment_externalId_key" ON "ApplicationDeployment"("projectId", "environment", "externalId");

-- AddForeignKey
ALTER TABLE "ApplicationDeployment" ADD CONSTRAINT "ApplicationDeployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
