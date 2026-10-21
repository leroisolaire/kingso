-- Titre résumé de chaque conversation pour l'historique du back-office.

-- CreateTable
CREATE TABLE "ConversationSummary" (
    "sessionToken" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("sessionToken")
);


-- RLS (cf. 20260909120000_enable_rls)
ALTER TABLE "ConversationSummary" ENABLE ROW LEVEL SECURITY;
