-- Chats configurables (Assistant), demandes SAV (Escalation), rattachement de l'historique.

-- CreateEnum
CREATE TYPE "AssistantAudience" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "AssistantAccess" AS ENUM ('PUBLIC', 'PASSWORD');

-- CreateEnum
CREATE TYPE "AssistantStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "History" ADD COLUMN     "assistantId" TEXT,
ADD COLUMN     "attachments" TEXT[],
ADD COLUMN     "ipHash" TEXT;

-- CreateTable
CREATE TABLE "Assistant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "previousSlugs" TEXT[],
    "name" TEXT NOT NULL,
    "status" "AssistantStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "AssistantAudience" NOT NULL DEFAULT 'CUSTOMER',
    "access" "AssistantAccess" NOT NULL DEFAULT 'PUBLIC',
    "accessPassword" TEXT,
    "welcomeMessage" TEXT NOT NULL,
    "startButtons" TEXT[],
    "suggestedQuestions" TEXT[],
    "instructions" TEXT NOT NULL DEFAULT '',
    "escalationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "escalationEmails" TEXT[],
    "attachmentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyMessageLimit" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assistant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "email" TEXT,
    "ipHash" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AssistantCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AssistantCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AssistantWebSources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AssistantWebSources_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Assistant_slug_key" ON "Assistant"("slug");

-- CreateIndex
CREATE INDEX "Escalation_sessionToken_idx" ON "Escalation"("sessionToken");

-- CreateIndex
CREATE INDEX "_AssistantCategories_B_index" ON "_AssistantCategories"("B");

-- CreateIndex
CREATE INDEX "_AssistantWebSources_B_index" ON "_AssistantWebSources"("B");

-- CreateIndex
CREATE INDEX "History_sessionToken_idx" ON "History"("sessionToken");

-- CreateIndex
CREATE INDEX "History_assistantId_ipHash_createdAt_idx" ON "History"("assistantId", "ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "History" ADD CONSTRAINT "History_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssistantCategories" ADD CONSTRAINT "_AssistantCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssistantCategories" ADD CONSTRAINT "_AssistantCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssistantWebSources" ADD CONSTRAINT "_AssistantWebSources_A_fkey" FOREIGN KEY ("A") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssistantWebSources" ADD CONSTRAINT "_AssistantWebSources_B_fkey" FOREIGN KEY ("B") REFERENCES "WebSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS sur les nouvelles tables (même principe que 20260909120000_enable_rls :
-- bloque l'API PostgREST anon/authenticated, Prisma passe par le rôle propriétaire).
ALTER TABLE "Assistant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Escalation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_AssistantCategories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_AssistantWebSources" ENABLE ROW LEVEL SECURITY;
