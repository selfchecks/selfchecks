CREATE TABLE "PerformanceSettings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerConcurrency" INTEGER NOT NULL DEFAULT 2,
    "artifactRetentionDays" INTEGER NOT NULL DEFAULT 14,
    "historyRetentionDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PerformanceSettings_projectId_key" ON "PerformanceSettings"("projectId");

ALTER TABLE "PerformanceSettings" ADD CONSTRAINT "PerformanceSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
