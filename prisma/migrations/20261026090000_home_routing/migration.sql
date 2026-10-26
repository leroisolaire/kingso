-- Page d'accueil : chat d'accueil configurable et tuiles d'orientation vers les autres chats.
-- « IF NOT EXISTS » : migration appliquée à la main dans l'éditeur SQL de Supabase (réseau du
-- bureau bloquant Postgres) ; `prisma migrate deploy` peut ensuite la rejouer sans erreur.

-- AlterTable
ALTER TABLE "Assistant" ADD COLUMN IF NOT EXISTS "homeDescription" TEXT,
ADD COLUMN IF NOT EXISTS "homeIcon" TEXT,
ADD COLUMN IF NOT EXISTS "homeOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "homeTitle" TEXT,
ADD COLUMN IF NOT EXISTS "isHome" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "showOnHome" BOOLEAN NOT NULL DEFAULT false;
