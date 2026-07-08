-- AlterTable
ALTER TABLE "CheckRun" ALTER COLUMN "checkId" DROP NOT NULL;
ALTER TABLE "CheckRun" ADD COLUMN "checkSnapshotKey" TEXT;
ALTER TABLE "CheckRun" ADD COLUMN "checkSnapshotName" TEXT;
ALTER TABLE "CheckRun" ADD COLUMN "checkSnapshotType" "CheckType";
ALTER TABLE "CheckRun" ADD COLUMN "checkSnapshotTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CheckRun" ADD COLUMN "checkSnapshotEntrypoint" TEXT;
ALTER TABLE "CheckRun" ADD COLUMN "checkSnapshotRequest" JSONB;
ALTER TABLE "CheckRun" ADD COLUMN "checkSnapshotGroupName" TEXT;
ALTER TABLE "CheckRun" ADD COLUMN "checkSnapshotProjectSlug" TEXT;

-- CreateIndex
CREATE INDEX "CheckRun_checkSnapshotProjectSlug_idx" ON "CheckRun"("checkSnapshotProjectSlug");
