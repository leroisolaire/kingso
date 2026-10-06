-- Active Row Level Security sur toutes les tables du schéma public.
-- Sans RLS, Supabase expose chaque table publiquement via son API REST
-- auto-générée (PostgREST) avec la clé "anon" (NEXT_PUBLIC_SUPABASE_ANON_KEY,
-- visible côté client) : n'importe qui pouvait lire/écrire directement dans
-- User (mots de passe hashés), Document (y compris les documents INTERNAL),
-- History, etc., en contournant entièrement la logique de l'application.
--
-- Aucune policy n'est ajoutée : l'app se connecte via le rôle propriétaire
-- des tables (Prisma / DATABASE_URL), qui contourne RLS par défaut et
-- continue de fonctionner normalement. Cette migration bloque uniquement
-- les rôles PostgREST (anon / authenticated).

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Faq" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "History" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
