-- Déplace l'extension pgvector hors du schéma public, comme recommandé par
-- Supabase (une extension dans public expose ses objets/fonctions dans le
-- même espace de noms que les tables applicatives).
--
-- Les colonnes existantes (Document.embedding, WebPage.embedding) référencent
-- le type "vector" par OID en interne : déplacer l'extension ne casse pas les
-- données ni les colonnes déjà créées.
--
-- Pour que les requêtes SQL brutes de l'app (::vector, non qualifié) continuent
-- de fonctionner sans modifier le code, on ajoute le schéma "extensions" au
-- search_path par défaut de la base.

CREATE SCHEMA IF NOT EXISTS extensions;

ALTER EXTENSION vector SET SCHEMA extensions;

ALTER DATABASE postgres SET search_path TO "$user", public, extensions;
