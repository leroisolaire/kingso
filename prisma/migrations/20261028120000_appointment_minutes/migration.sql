-- Durée de chaque intervention planifiée (sinon la durée par défaut des réglages de l'agenda)
ALTER TABLE "SavCase" ADD COLUMN     "appointmentMinutes" INTEGER;
