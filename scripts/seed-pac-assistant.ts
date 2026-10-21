/**
 * Crée le chat « Kingso PAC clients » (/pac) en BROUILLON, ainsi que les sous-catégories
 * Hitachi et Atlantic sous « Pompe à Chaleur (PAC) ». Idempotent : ne modifie rien d'existant.
 * Usage : npm run seed-pac
 */

import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

try { process.loadEnvFile(path.resolve(process.cwd(), '.env.local')) } catch { /* absent en CI */ }

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const INSTRUCTIONS = `Tu aides les clients de Le Roi Solaire équipés d'une pompe à chaleur, principalement de marque Hitachi ou Atlantic : mise en route, utilisation au quotidien, signification d'un code erreur ou d'un voyant, vérifications simples en cas de panne, entretien courant.

Déroulé conseillé :
1. Si tu ne connais pas encore la marque, demande-la. Si le client ne la connaît pas, propose-lui de prendre en photo l'étiquette signalétique de l'appareil (souvent sur le côté de l'unité extérieure ou de l'unité intérieure) ou l'écran de commande.
2. Si un code erreur ou un voyant s'affiche, demande le code exact ou une photo de l'écran.
3. Donne d'abord les vérifications simples que la documentation présente comme faisables par l'utilisateur, étape par étape, puis demande au client ce que ça donne.
4. Pour un sujet sans rapport avec la pompe à chaleur (panneaux solaires, devis, facturation…), indique gentiment que ce chat est dédié aux pompes à chaleur et oriente vers https://www.leroisolaire.fr `

async function main() {
  const pac = await db.category.findFirst({ where: { name: 'Pompe à Chaleur (PAC)', parentId: null } })
    ?? await db.category.create({ data: { name: 'Pompe à Chaleur (PAC)' } })

  for (const brand of ['Hitachi', 'Atlantic']) {
    const exists = await db.category.findFirst({ where: { name: brand, parentId: pac.id } })
    if (!exists) {
      await db.category.create({ data: { name: brand, parentId: pac.id, description: `Notices et codes erreur ${brand}` } })
      console.log(`✓ Catégorie créée : Pompe à Chaleur (PAC) > ${brand}`)
    }
  }

  if (await db.assistant.findUnique({ where: { slug: 'pac' } })) {
    console.log('Le chat /pac existe déjà — rien à faire.')
    return
  }

  const pannesPac = await db.category.findFirst({ where: { name: 'Pannes PAC' } })

  await db.assistant.create({
    data: {
      slug: 'pac',
      name: 'Kingso PAC clients',
      status: 'DRAFT',
      audience: 'CUSTOMER',
      access: 'PUBLIC',
      welcomeMessage: 'Bonjour ! Je suis Kingso, l\'assistant de Le Roi Solaire. Je vais vous aider avec votre pompe à chaleur : mise en route, code erreur, panne…\n\nPour commencer, quelle est la marque de votre pompe à chaleur ?',
      startButtons: ['Hitachi', 'Atlantic', 'Je ne connais pas la marque'],
      suggestedQuestions: [
        'Mettre en route ma pompe à chaleur',
        'J\'ai un code erreur',
        'Je n\'ai plus de chauffage',
        'Je n\'ai plus d\'eau chaude',
        'Entretien de ma pompe à chaleur',
      ],
      instructions: INSTRUCTIONS,
      escalationEnabled: true,
      escalationEmails: ['lead@leroisolaire.fr'],
      attachmentsEnabled: true,
      dailyMessageLimit: 40,
      categories: { connect: [{ id: pac.id }, ...(pannesPac ? [{ id: pannesPac.id }] : [])] },
    },
  })
  console.log('✓ Chat « Kingso PAC clients » créé en brouillon : /pac')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
