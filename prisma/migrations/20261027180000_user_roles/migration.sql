-- Rôles cumulables du back-office (Super admin, SAV, Planning), connexion Google, désactivation des comptes.
-- L'ancienne colonne « role » est gardée pour l'instant (la version en ligne la lit encore) : à supprimer plus tard.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'SAV', 'PLANNING');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "password" DROP NOT NULL;

-- Les comptes existants (admins du back-office) deviennent Super admin
UPDATE "User" SET "roles" = ARRAY['SUPER_ADMIN']::"UserRole"[];
