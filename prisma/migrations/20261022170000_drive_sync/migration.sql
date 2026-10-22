-- Synchronisation Google Drive : lien document ↔ fichier Drive, source, correspondance dossiers → catégories.

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "driveFileId" TEXT,
ADD COLUMN     "driveMd5" TEXT,
ADD COLUMN     "driveModifiedTime" TIMESTAMP(3),
ADD COLUMN     "drivePath" TEXT;

-- CreateTable
CREATE TABLE "DriveSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveCategoryMapping" (
    "folderName" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "DriveCategoryMapping_pkey" PRIMARY KEY ("folderName")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveSource_folderId_key" ON "DriveSource"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_driveFileId_key" ON "Document"("driveFileId");

-- AddForeignKey
ALTER TABLE "DriveCategoryMapping" ADD CONSTRAINT "DriveCategoryMapping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS (cf. 20260909120000_enable_rls)
ALTER TABLE "DriveSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DriveCategoryMapping" ENABLE ROW LEVEL SECURITY;
