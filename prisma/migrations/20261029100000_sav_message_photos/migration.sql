-- Photos jointes à un message de dossier SAV (saisie par l'équipe) et ce que Kingso y a lu.
-- Uniquement des ajouts.

-- AlterTable
ALTER TABLE "SavMessage"
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photoNote" TEXT;
