CREATE TYPE "CheckRunSource" AS ENUM ('SCHEDULE', 'MANUAL', 'CLI');

ALTER TABLE "CheckRun" ADD COLUMN "runSource" "CheckRunSource";
