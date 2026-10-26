/**
 * Crée le chat d'accueil (kingso.fr) et le chat Photovoltaïque, en BROUILLON, et propose le chat
 * PAC sur la page d'accueil. Idempotent : un chat existant n'est pas modifié (sauf les réglages
 * d'accueil du chat PAC s'ils sont vides).
 * Usage : npm run seed-home-pv
 */

import path from 'node:path'

try { process.loadEnvFile(path.resolve(process.cwd(), '.env.local')) } catch { /* absent en CI */ }

const HOME_INSTRUCTIONS = `Tu es le chat d'accueil de Le Roi Solaire sur kingso.fr. Tu réponds aux questions générales : l'entreprise, ses offres (panneaux solaires, pompes à chaleur…), les aides et démarches, le déroulement d'un projet.
Pour un problème ou une question technique sur une installation précise (pompe à chaleur, panneaux solaires, onduleur, batterie…), oriente vers le chat spécialisé adapté avec son lien.
Pour une demande de devis ou un projet, oriente vers l'équipe Le Roi Solaire → https://www.leroisolaire.fr `

const PV_INSTRUCTIONS = `Tu aides les clients de Le Roi Solaire équipés d'une installation photovoltaïque : panneaux solaires, onduleurs et micro-onduleurs, batteries de stockage, suivi de production (applications et plateformes de monitoring), baisse de production, voyants et messages d'erreur.

Déroulé conseillé :
1. Si la marque ou le modèle de l'équipement concerné (onduleur, micro-onduleurs, batterie) change la réponse et que tu ne le connais pas, demande-le. Si le client ne le connaît pas, propose-lui de prendre en photo l'étiquette de l'équipement ou l'écran de son application de suivi.
2. Si un message d'erreur ou un voyant s'affiche, demande le message exact ou une photo.
3. Donne d'abord les vérifications simples que la documentation présente comme faisables par l'utilisateur (application de suivi, réarmement décrit dans la notice, connexion internet de l'équipement…), étape par étape, puis demande au client ce que ça donne.
4. Ne demande jamais d'intervenir sur le toit, sur les câbles ou dans un coffret électrique : propose le SAV.`

async function main() {
  const { db } = await import('../src/lib/db/client')

  const allCategories = await db.category.findMany({ where: { parentId: null }, select: { id: true, name: true } })
  const webSources = await db.webSource.findMany({ select: { id: true } })
  const pv = allCategories.find((c) => c.name === 'Photovoltaïque (PV)')
  const pannesPv = await db.category.findFirst({ where: { name: 'Pannes PV' }, select: { id: true } })

  // Chat d'accueil : questions générales sur toute la documentation publique + site web
  if (!(await db.assistant.findUnique({ where: { slug: 'accueil' } }))) {
    await db.assistant.create({
      data: {
        slug: 'accueil', name: 'Kingso — Accueil', status: 'DRAFT', audience: 'CUSTOMER', access: 'PUBLIC',
        isHome: true,
        welcomeMessage: 'Bonjour ! Je suis Kingso, l\'assistant de Le Roi Solaire.\n\nPosez-moi votre question, ou choisissez un sujet ci-dessous :',
        startButtons: [], suggestedQuestions: [],
        instructions: HOME_INSTRUCTIONS,
        escalationEnabled: true, escalationEmails: ['lead@leroisolaire.fr'], attachmentsEnabled: true, dailyMessageLimit: 40,
        categories: { connect: allCategories.map((c) => ({ id: c.id })) },
        webSources: { connect: webSources },
      },
    })
    console.log('✓ Chat d\'accueil créé en brouillon : /accueil')
  } else console.log('Le chat /accueil existe déjà.')

  // Chat Photovoltaïque
  if (!(await db.assistant.findUnique({ where: { slug: 'pv' } }))) {
    if (!pv) throw new Error('Catégorie « Photovoltaïque (PV) » introuvable')
    await db.assistant.create({
      data: {
        slug: 'pv', name: 'Kingso Photovoltaïque', status: 'DRAFT', audience: 'CUSTOMER', access: 'PUBLIC',
        welcomeMessage: 'Bonjour ! Je suis Kingso, l\'assistant de Le Roi Solaire. Je vais vous aider avec votre installation photovoltaïque : production, onduleur, batterie, suivi…\n\nQuelle est votre question ?',
        startButtons: [],
        suggestedQuestions: ['Ma production a baissé', 'Mon onduleur affiche une erreur', 'Ma batterie ne se charge pas', 'Suivre ma production'],
        instructions: PV_INSTRUCTIONS,
        escalationEnabled: true, escalationEmails: ['lead@leroisolaire.fr'], attachmentsEnabled: true, dailyMessageLimit: 40,
        showOnHome: true, homeTitle: 'Mes panneaux solaires',
        homeDescription: 'Production, onduleur, batterie, suivi et pannes de votre installation photovoltaïque',
        homeIcon: '☀️', homeOrder: 2,
        categories: { connect: [{ id: pv.id }, ...(pannesPv ? [{ id: pannesPv.id }] : [])] },
      },
    })
    console.log('✓ Chat Photovoltaïque créé en brouillon : /pv')
  } else console.log('Le chat /pv existe déjà.')

  // Chat PAC : proposé sur l'accueil (réglages d'accueil remplis s'ils sont vides)
  const pac = await db.assistant.findUnique({ where: { slug: 'pac' }, select: { id: true, homeDescription: true } })
  if (pac && !pac.homeDescription) {
    await db.assistant.update({
      where: { id: pac.id },
      data: {
        showOnHome: true, homeTitle: 'Ma pompe à chaleur',
        homeDescription: 'Mise en route, code erreur, panne et entretien de votre pompe à chaleur',
        homeIcon: '🔥', homeOrder: 1,
      },
    })
    console.log('✓ Chat PAC proposé sur la page d\'accueil')
  }
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
