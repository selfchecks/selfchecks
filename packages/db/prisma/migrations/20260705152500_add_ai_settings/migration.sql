-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "apiEndpoint" TEXT NOT NULL,
    "apiKeyCiphertext" TEXT,
    "model" TEXT NOT NULL,
    "responseLanguage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiSettings_projectId_key" ON "AiSettings"("projectId");

-- AddForeignKey
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
