ALTER TABLE "TestSession" ADD COLUMN "projectId" TEXT;
ALTER TABLE "CheckRun" ADD COLUMN "projectId" TEXT;

INSERT INTO "Project" ("id", "slug", "name", "createdAt", "updatedAt")
SELECT 'legacy-default', 'default', 'default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Project")
  AND (
    EXISTS (SELECT 1 FROM "TestSession")
    OR EXISTS (SELECT 1 FROM "CheckRun")
  );

UPDATE "CheckRun" AS run
SET "projectId" = check_row."projectId"
FROM "Check" AS check_row
WHERE run."checkId" = check_row."id"
  AND run."projectId" IS NULL;

UPDATE "CheckRun" AS run
SET "projectId" = project."id"
FROM "Project" AS project
WHERE run."checkSnapshotProjectSlug" = project."slug"
  AND run."projectId" IS NULL;

UPDATE "TestSession" AS session
SET "projectId" = session_project."projectId"
FROM (
  SELECT "testSessionId", MIN("projectId") AS "projectId"
  FROM "CheckRun"
  WHERE "testSessionId" IS NOT NULL
    AND "projectId" IS NOT NULL
  GROUP BY "testSessionId"
) AS session_project
WHERE session."id" = session_project."testSessionId"
  AND session."projectId" IS NULL;

UPDATE "TestSession"
SET "projectId" = (SELECT "id" FROM "Project" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "projectId" IS NULL;

UPDATE "CheckRun"
SET "projectId" = (SELECT "id" FROM "Project" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "projectId" IS NULL;

ALTER TABLE "TestSession" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "CheckRun" ALTER COLUMN "projectId" SET NOT NULL;

DROP INDEX "TestSession_kind_createdAt_idx";
CREATE INDEX "TestSession_projectId_kind_createdAt_idx" ON "TestSession"("projectId", "kind", "createdAt");
CREATE INDEX "CheckRun_projectId_status_createdAt_idx" ON "CheckRun"("projectId", "status", "createdAt");

ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckRun" ADD CONSTRAINT "CheckRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
