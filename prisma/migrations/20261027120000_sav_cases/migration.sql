-- CreateEnum
CREATE TYPE "SavSource" AS ENUM ('VOICEMAIL', 'CHAT', 'MANUAL');

-- CreateEnum
CREATE TYPE "SavStatus" AS ENUM ('NEW', 'WAITING', 'IN_CHAT', 'TO_CALL', 'TO_SCHEDULE', 'SCHEDULED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SavCategory" AS ENUM ('SELF_HELP', 'INTERVENTION', 'ADMIN', 'OTHER_PRODUCT', 'UNCLEAR');

-- CreateTable
CREATE TABLE "SavCase" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "source" "SavSource" NOT NULL,
    "status" "SavStatus" NOT NULL DEFAULT 'NEW',
    "category" "SavCategory" NOT NULL DEFAULT 'UNCLEAR',
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "urgentReason" TEXT,
    "phoneKey" TEXT,
    "callbackPhone" TEXT,
    "customerName" TEXT,
    "email" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "clientId" TEXT,
    "clientMatch" TEXT,
    "product" TEXT,
    "equipment" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "clientQuestion" TEXT,
    "emailProblem" TEXT,
    "errorCode" TEXT,
    "noHeating" BOOLEAN NOT NULL DEFAULT false,
    "assistantId" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "chatSessionToken" TEXT,
    "chatOpenedAt" TIMESTAMP(3),
    "emailTemplate" TEXT,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "emailScheduledAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailMessageId" TEXT,
    "emailError" TEXT,
    "planningEventId" TEXT,
    "planningDate" TIMESTAMP(3),
    "appointmentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavMessage" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "source" "SavSource" NOT NULL,
    "externalId" TEXT,
    "callerPhone" TEXT,
    "durationSec" INTEGER,
    "text" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavEmailTemplate" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavEmailTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SavClient" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phones" TEXT[],
    "email" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "equipment" TEXT,
    "contract" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavCase_number_key" ON "SavCase"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SavCase_accessToken_key" ON "SavCase"("accessToken");

-- CreateIndex
CREATE INDEX "SavCase_status_idx" ON "SavCase"("status");

-- CreateIndex
CREATE INDEX "SavCase_phoneKey_idx" ON "SavCase"("phoneKey");

-- CreateIndex
CREATE UNIQUE INDEX "SavMessage_externalId_key" ON "SavMessage"("externalId");

-- CreateIndex
CREATE INDEX "SavEvent_caseId_createdAt_idx" ON "SavEvent"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavClient_externalId_key" ON "SavClient"("externalId");

-- CreateIndex
CREATE INDEX "SavClient_phones_idx" ON "SavClient" USING GIN ("phones");

-- AddForeignKey
ALTER TABLE "SavCase" ADD CONSTRAINT "SavCase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "SavClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavCase" ADD CONSTRAINT "SavCase_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavMessage" ADD CONSTRAINT "SavMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SavCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavEvent" ADD CONSTRAINT "SavEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SavCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tables accessibles uniquement par le serveur (aucun accès via l'API publique Supabase)
ALTER TABLE "SavCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavEmailTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;
