-- Rangement automatique depuis « À trier », contrôle de confidentialité des documents publics, journal de synchronisation.

-- CreateEnum
CREATE TYPE "DocumentReview" AS ENUM ('TO_SORT', 'CONFIDENTIAL', 'IGNORED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "classifiedAt" TIMESTAMP(3),
ADD COLUMN     "proposedPath" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewState" "DocumentReview";

-- CreateTable
CREATE TABLE "DriveEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriveEvent_createdAt_idx" ON "DriveEvent"("createdAt");


-- RLS (cf. 20260909120000_enable_rls)
ALTER TABLE "DriveEvent" ENABLE ROW LEVEL SECURITY;
