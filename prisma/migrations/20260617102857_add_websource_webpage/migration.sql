-- CreateTable
CREATE TABLE "WebSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "maxPages" INTEGER NOT NULL DEFAULT 80,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCrawled" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebPage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "sourceId" TEXT NOT NULL,
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebSource_url_key" ON "WebSource"("url");

-- CreateIndex
CREATE UNIQUE INDEX "WebPage_url_key" ON "WebPage"("url");

-- AddForeignKey
ALTER TABLE "WebPage" ADD CONSTRAINT "WebPage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "WebSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
