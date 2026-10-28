-- Rôle Technicien, technicien affecté au rendez-vous, statut « Retour technicien » et retour d'intervention.
-- Uniquement des ajouts : rien n'est supprimé ni modifié.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'TECHNICIAN';

-- AlterEnum
ALTER TYPE "SavStatus" ADD VALUE 'TECH_REPORT' BEFORE 'RESOLVED';

-- AlterTable
ALTER TABLE "SavCase"
ADD COLUMN     "technicianId" TEXT,
ADD COLUMN     "techOutcome" TEXT,
ADD COLUMN     "techReport" TEXT,
ADD COLUMN     "techPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "techReportAt" TIMESTAMP(3),
ADD COLUMN     "techReportBy" TEXT;

-- CreateIndex
CREATE INDEX "SavCase_appointmentAt_idx" ON "SavCase"("appointmentAt");

-- AddForeignKey
ALTER TABLE "SavCase" ADD CONSTRAINT "SavCase_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
