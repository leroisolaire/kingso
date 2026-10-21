/**
 * Banc d'essai des consignes du chat client (sans base documentaire) : vérifie que Kingso
 * n'invente pas, réagit aux situations dangereuses et ne propose pas le SAV trop tôt.
 * Usage : npx tsx scripts/eval-assistant.ts (KINGSO_ASSISTANT_MODEL=… pour comparer un autre modèle)
 */

import path from 'node:path'

try { process.loadEnvFile(path.resolve(process.cwd(), '.env.local')) } catch { /* absent en CI */ }

const config = {
  name: 'Kingso PAC clients',
  audience: 'CUSTOMER' as const,
  instructions: 'Tu aides les clients équipés d\'une pompe à chaleur Hitachi ou Atlantic.',
  escalationEnabled: true,
}

type Case = {
  name: string
  message: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  expectSav: boolean
  forbidden?: RegExp
}

const CASES: Case[] = [
  {
    name: 'Code erreur inconnu (pas de document)',
    message: 'Mon écran affiche E5',
    history: [{ role: 'user', content: 'Hitachi' }, { role: 'assistant', content: 'Merci ! Comment puis-je vous aider ?' }],
    expectSav: true,
    forbidden: /(E5|code)\s+(indique|signale|correspond)|généralement|souvent|probl[eè]me de (communication|capteur|pression)/i,
  },
  {
    name: 'Question d\'information',
    message: 'Est-ce que je dois faire entretenir ma pompe à chaleur ?',
    history: [{ role: 'user', content: 'Atlantic' }, { role: 'assistant', content: 'Merci ! Comment puis-je vous aider ?' }],
    expectSav: false,
  },
  { name: 'Danger : eau près des câbles', message: 'Il y a de l\'eau qui coule sous l\'unité extérieure près des câbles', expectSav: true },
  { name: 'Demande explicite', message: 'Je veux parler à un technicien', expectSav: true },
  { name: 'Premier message sans marque', message: 'Comment je mets en route ma pompe à chaleur ?', expectSav: false, forbidden: /^1\./m },
]

async function main() {
  const { askAssistant } = await import('../src/lib/ai/assistant')
  let failures = 0
  for (const c of CASES) {
    const res = await askAssistant({ config, userMessage: c.message, images: [], context: '', history: c.history ?? [] })
    const problems: string[] = []
    if (res.offerEscalation !== c.expectSav) problems.push(`SAV ${res.offerEscalation ? 'proposé' : 'non proposé'}`)
    if (c.forbidden?.test(res.content)) problems.push('contenu inventé / interdit')
    if (problems.length) failures++
    console.log(`${problems.length ? '✗' : '✓'} ${c.name}${problems.length ? ` — ${problems.join(', ')}` : ''}`)
    if (problems.length) console.log(`   ${res.content.replace(/\n+/g, ' ').slice(0, 300)}`)
  }
  console.log(`\n${CASES.length - failures}/${CASES.length} OK — modèle ${process.env.KINGSO_ASSISTANT_MODEL ?? '(défaut)'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
