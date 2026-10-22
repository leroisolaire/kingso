-- Avis 👍/👎 des clients et questions restées sans réponse (page « À améliorer »).


-- AlterTable
ALTER TABLE "History" ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "unanswered" BOOLEAN NOT NULL DEFAULT false;

