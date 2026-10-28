-- Présence du client sur son lien personnel (ouverture du lien, dernier signal de la page)
ALTER TABLE "SavCase" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "linkOpenedAt" TIMESTAMP(3);
