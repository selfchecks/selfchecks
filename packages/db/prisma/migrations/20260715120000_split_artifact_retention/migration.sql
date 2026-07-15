ALTER TABLE "PerformanceSettings"
RENAME COLUMN "artifactRetentionDays" TO "passedArtifactRetentionDays";

ALTER TABLE "PerformanceSettings"
ADD COLUMN "failedArtifactRetentionDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN "testSessionWorkspaceRetentionDays" INTEGER NOT NULL DEFAULT 14;

UPDATE "PerformanceSettings"
SET "failedArtifactRetentionDays" = "passedArtifactRetentionDays",
    "testSessionWorkspaceRetentionDays" = "passedArtifactRetentionDays";
