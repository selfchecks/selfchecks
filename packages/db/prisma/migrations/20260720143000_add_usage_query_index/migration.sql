CREATE INDEX "CheckRun_finishedAt_status_idx" ON "CheckRun"("finishedAt", "status");
CREATE INDEX "Artifact_runId_idx" ON "Artifact"("runId");
