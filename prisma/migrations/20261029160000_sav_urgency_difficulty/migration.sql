-- Urgence (1 à 5, proposée par Kingso) et difficulté (1 à 5) des dossiers SAV
ALTER TABLE "SavCase" ADD COLUMN IF NOT EXISTS "urgency" INTEGER;
ALTER TABLE "SavCase" ADD COLUMN IF NOT EXISTS "difficulty" INTEGER;
-- Dossiers déjà marqués urgents : urgence 4 (une seule notion d'urgence : 4 et plus = badge URGENT)
UPDATE "SavCase" SET "urgency" = 4 WHERE "urgent" = true AND "urgency" IS NULL;
