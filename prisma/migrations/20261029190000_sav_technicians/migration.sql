-- Fiches intervenants (techniciens SAV et poseurs), séparées des comptes de connexion
CREATE TYPE "TechnicianKind" AS ENUM ('SAV', 'POSEUR');

CREATE TABLE "Technician" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TechnicianKind" NOT NULL DEFAULT 'SAV',
    "phone" TEXT,
    "userId" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxDifficulty" INTEGER,
    "sector" TEXT,
    "agendaCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Technician_userId_key" ON "Technician"("userId");
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise : une fiche par technicien actuel (rôle Technicien, ou déjà affecté à un dossier), avec le même identifiant
-- que son compte : les affectations des dossiers restent valables telles quelles. Même date de création : mêmes couleurs.
INSERT INTO "Technician" ("id", "name", "kind", "userId", "active", "createdAt", "updatedAt")
SELECT u."id", COALESCE(NULLIF(u."name", ''), u."email"), 'SAV', u."id",
       u."active" AND 'TECHNICIAN' = ANY(u."roles"), u."createdAt", CURRENT_TIMESTAMP
FROM "User" u
WHERE 'TECHNICIAN' = ANY(u."roles") OR EXISTS (SELECT 1 FROM "SavCase" c WHERE c."technicianId" = u."id");

-- Les dossiers pointent désormais vers la fiche intervenant
ALTER TABLE "SavCase" DROP CONSTRAINT IF EXISTS "SavCase_technicianId_fkey";
ALTER TABLE "SavCase" ADD CONSTRAINT "SavCase_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lien personnel de l'intervenant (poseurs)
ALTER TABLE "SavCase" ADD COLUMN "techToken" TEXT;
CREATE UNIQUE INDEX "SavCase_techToken_key" ON "SavCase"("techToken");

-- Géocodage des adresses (proximité des chantiers)
CREATE TABLE "GeoPoint" (
    "query" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeoPoint_pkey" PRIMARY KEY ("query")
);
