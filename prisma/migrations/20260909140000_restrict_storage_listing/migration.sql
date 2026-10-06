-- Supprime la policy RLS "allow_reads" sur storage.objects, qui autorisait
-- n'importe quel client (clé anon) à lister tous les fichiers du bucket
-- public "documents" via l'API Storage.
--
-- Un bucket public n'a pas besoin de policy SELECT sur storage.objects pour
-- que les URLs publiques (getPublicUrl, utilisées par l'app) fonctionnent :
-- Supabase sert ces fichiers directement sans passer par RLS. Cette policy
-- ne servait donc qu'à exposer la liste complète des fichiers (noms,
-- métadonnées) sans raison applicative.

DROP POLICY IF EXISTS "allow_reads" ON storage.objects;
