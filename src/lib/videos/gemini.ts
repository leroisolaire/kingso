import 'server-only'

// Gemini (Google) « regarde » une vidéo YouTube publique à partir de son lien, image et son,
// et rédige une fiche pratique. Clé GEMINI_API_KEY (créée dans AI Studio).
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'

/** Clé Gemini (AI Studio) ; à défaut, la clé Google commune. */
const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

export function isGeminiConfigured(): boolean {
  return Boolean(geminiKey())
}

const PROMPT = `Tu prépares une fiche pratique pour l'assistant de Le Roi Solaire (installateur de pompes à chaleur, climatisations et panneaux solaires), à partir de cette vidéo d'un fabricant ou d'un installateur.

Rédige la fiche en français, AVEC TES PROPRES MOTS (ne recopie pas la transcription), en texte simple sans markdown :
Sujet : en une phrase, le problème ou l'opération traité.
Équipements concernés : marque, gamme, modèles, télécommande ou application, tels qu'indiqués ou montrés dans la vidéo.
Public : « utilisateur » si un particulier peut le faire seul, « professionnel » si la vidéo s'adresse à un installateur ou demande d'ouvrir l'appareil, d'intervenir sur l'électricité ou le circuit frigorifique.
Étapes : la procédure numérotée (1. 2. 3.), une action par étape, avec les écrans, menus, boutons, codes et valeurs montrés.
Précautions : les mises en garde de la vidéo (couper l'alimentation, etc.).
Si la vidéo ne montre pas de procédure, résume en quelques lignes ce qu'elle explique.
N'ajoute rien qui ne soit pas dans la vidéo.`

/** Fiche pratique rédigée à partir de la vidéo (texte brut). */
export async function summarizeVideo(url: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() ?? '' },
    body: JSON.stringify({
      contents: [{ parts: [{ file_data: { file_uri: url } }, { text: PROMPT }] }],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Gemini : ${data?.error?.message ?? `HTTP ${res.status}`}`)
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('')
    .trim()
  if (!text) throw new Error(`Gemini n'a pas pu lire la vidéo (${data.candidates?.[0]?.finishReason ?? 'réponse vide'}).`)
  return text
}
