/**
 * Crée des dossiers SAV à partir d'emails du répondeur enregistrés en .eml (test du parcours complet,
 * en attendant la réception automatique par Gmail). Les envois restent bloqués tant que les réglages
 * SAV sont « en pause ».
 * Usage : npx tsx --conditions=react-server scripts/sav-import-eml.ts <dossier> [--analyse-seule]
 *   --analyse-seule : affiche le tri de chaque message sans rien écrire en base
 */

import fs from 'node:fs'
import path from 'node:path'

try { process.loadEnvFile(path.resolve(process.cwd(), '.env.local')) } catch { /* absent en CI */ }

async function main() {
  const dir = process.argv[2]
  const dryRun = process.argv.includes('--analyse-seule')
  if (!dir) throw new Error('Indiquez le dossier contenant les fichiers .eml')

  const { parseRawEmail } = await import('../src/lib/sav/mime')
  const { isConnectelVoicemail, parseVoicemail } = await import('../src/lib/sav/connectel')
  const { analyzeMessage } = await import('../src/lib/sav/analyze')
  const { ingestMessage } = await import('../src/lib/sav/ingest')

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.eml')).sort()
  // Dans l'ordre d'arrivée : les relances se regroupent sur le premier message
  const emails = files.map((f) => ({ file: f, email: parseRawEmail(fs.readFileSync(path.join(dir, f), 'latin1')) }))
    .filter(({ email }) => isConnectelVoicemail(email.from, email.subject))
    .map((e) => ({ ...e, voicemail: parseVoicemail(e.email.text) }))
    .sort((a, b) => (a.voicemail.receivedAt?.getTime() ?? 0) - (b.voicemail.receivedAt?.getTime() ?? 0))

  console.log(`${emails.length} message(s) du répondeur sur ${files.length} fichier(s)`)
  for (const { email, voicemail } of emails) {
    if (dryRun) {
      const a = await analyzeMessage(voicemail.transcript)
      console.log(`- ${voicemail.receivedAt?.toISOString().slice(0, 16)} ${a.category.padEnd(13)} ${a.urgent ? 'URGENT ' : ''}${a.mentionsPreviousCalls ? 'RELANCE ' : ''}| ${a.clientQuestion}`)
      continue
    }
    const r = await ingestMessage({
      source: 'VOICEMAIL',
      externalId: email.messageId,
      text: voicemail.transcript,
      callerPhone: voicemail.callerPhone,
      dictatedPhone: voicemail.dictatedPhone,
      receivedAt: voicemail.receivedAt,
      durationSec: voicemail.durationSec,
    })
    console.log(`- ${r.duplicate ? 'déjà importé' : r.created ? 'nouveau dossier' : 'ajouté au dossier existant (relance)'} ${r.caseId}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
