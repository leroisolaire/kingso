-- Chaînes YouTube suivies et vidéos triées (fiches pratiques de dépannage via Gemini).

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('TO_REVIEW', 'SELECTED', 'SKIPPED', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "VideoSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "uploadsPlaylistId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "visibility" "DocumentType" NOT NULL DEFAULT 'PUBLIC',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "relevant" BOOLEAN,
    "topic" TEXT,
    "reason" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'TO_REVIEW',
    "note" TEXT,
    "driveFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoSource_channelId_key" ON "VideoSource"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoItem_videoId_key" ON "VideoItem"("videoId");

-- CreateIndex
CREATE INDEX "VideoItem_status_idx" ON "VideoItem"("status");

-- AddForeignKey
ALTER TABLE "VideoItem" ADD CONSTRAINT "VideoItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "VideoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS (cf. 20260909120000_enable_rls)
ALTER TABLE "VideoSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VideoItem" ENABLE ROW LEVEL SECURITY;
