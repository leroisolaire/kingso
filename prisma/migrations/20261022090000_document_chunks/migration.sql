-- Import en masse : statut de traitement, fichier original privé, empreinte anti-doublons,
-- et découpage des documents en passages indexés séparément (DocumentChunk).

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'ERROR');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "statusMessage" TEXT,
ADD COLUMN     "storagePath" TEXT;

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "embedding" vector(1024),

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- CreateIndex
CREATE INDEX "Document_contentHash_idx" ON "Document"("contentHash");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS (cf. 20260909120000_enable_rls)
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
