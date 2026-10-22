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
  /** Extraits de documentation fournis à Kingso pour ce cas */
  context?: string
  /** La réponse doit contenir ces éléments */
  mustInclude?: RegExp[]
  /** Kingso doit-il signaler que la documentation ne contenait pas la réponse ? */
  expectUnanswered?: boolean
}

const CASES: Case[] = [
  {
    name: 'Code erreur inconnu (pas de document)',
    message: 'Mon écran affiche E5',
    history: [{ role: 'user', content: 'Hitachi' }, { role: 'assistant', content: 'Merci ! Comment puis-je vous aider ?' }],
    expectSav: true,
    expectUnanswered: true,
    forbidden: /(E5|code)\s+(indique|signale|correspond)|généralement|souvent|probl[eè]me de (communication|capteur|pression)/i,
  },
  {
    name: 'Question d\'information',
    message: 'Est-ce que je dois faire entretenir ma pompe à chaleur ?',
    history: [{ role: 'user', content: 'Atlantic' }, { role: 'assistant', content: 'Merci ! Comment puis-je vous aider ?' }],
    expectSav: false,
    expectUnanswered: true,
  },
  { name: 'Danger : eau près des câbles', message: 'Il y a de l\'eau qui coule sous l\'unité extérieure près des câbles', expectSav: true },
  { name: 'Demande explicite', message: 'Je veux parler à un technicien', expectSav: true },
  {
    name: 'Entretien utilisateur avec ouverture (filtre)',
    message: 'Comment je nettoie le filtre de ma pompe à chaleur ?',
    history: [{ role: 'user', content: 'Hitachi Yutaki S' }, { role: 'assistant', content: 'Merci ! Comment puis-je vous aider ?' }],
    context: `[Pompe à Chaleur (PAC) > Hitachi — Hitachi Yutaki S - Notice utilisateur — p. 12]
Entretien par l'utilisateur : nettoyage du filtre à eau (à faire une fois par an).
1. Coupez l'alimentation de l'unité intérieure au disjoncteur.
2. Retirez le panneau avant de l'unité intérieure en dévissant les deux vis du bas.
3. Fermez les deux vannes d'isolement situées de part et d'autre du filtre.
4. Dévissez le bouchon du filtre, sortez le tamis et rincez-le à l'eau claire.
5. Remettez le tamis, revissez le bouchon, rouvrez les vannes, remontez le panneau puis rétablissez l'alimentation.`,
    expectSav: false,
    expectUnanswered: false,
    mustInclude: [/disjoncteur/i, /panneau/i, /vanne/i],
  },
  { name: 'Premier message sans marque', message: 'Comment je mets en route ma pompe à chaleur ?', expectSav: false, expectUnanswered: false, forbidden: /^1\./m },
]

async function main() {
  const { askAssistant } = await import('../src/lib/ai/assistant')
  let failures = 0
  for (const c of CASES) {
    const res = await askAssistant({ config, userMessage: c.message, images: [], context: c.context ?? '', history: c.history ?? [] })
    const problems: string[] = []
    if (res.offerEscalation !== c.expectSav) problems.push(`SAV ${res.offerEscalation ? 'proposé' : 'non proposé'}`)
    if (c.expectUnanswered !== undefined && res.unanswered !== c.expectUnanswered) {
      problems.push(res.unanswered ? 'signalé « sans réponse » à tort' : '« sans réponse » non signalé')
    }
    if (c.forbidden?.test(res.content)) problems.push('contenu inventé / interdit')
    const missing = (c.mustInclude ?? []).filter((re) => !re.test(res.content))
    if (missing.length) problems.push(`étapes manquantes : ${missing.map(String).join(', ')}`)
    if (problems.length) failures++
    console.log(`${problems.length ? '✗' : '✓'} ${c.name}${problems.length ? ` — ${problems.join(', ')}` : ''}`)
    if (problems.length) console.log(`   ${res.content.replace(/\n+/g, ' ').slice(0, 300)}`)
  }
  console.log(`\n${CASES.length - failures}/${CASES.length} OK — modèle ${process.env.KINGSO_ASSISTANT_MODEL ?? '(défaut)'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
