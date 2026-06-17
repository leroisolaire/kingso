import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import path from 'node:path'

process.loadEnvFile(path.resolve(process.cwd(), '.env'))

const url = new URL(process.env.DATABASE_URL!)
const pool = new pg.Pool({
  host: url.hostname,
  port: Number(url.port) || 5432,
  database: url.pathname.slice(1),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

const CATEGORIES = [
  {
    name: 'Photovoltaïque (PV)',
    description: 'Tout ce qui concerne les panneaux solaires photovoltaïques',
    children: [
      { name: 'Installation PV', description: 'Pose, fixation, raccordement des panneaux' },
      { name: 'Maintenance PV', description: 'Entretien et suivi des installations PV' },
      { name: 'Panneaux & onduleurs', description: 'Produits photovoltaïques et onduleurs' },
      { name: 'Batteries & stockage', description: 'Solutions de stockage de l\'énergie' },
      { name: 'Fiches techniques PV', description: 'Fiches produits et spécifications techniques PV' },
    ],
  },
  {
    name: 'Pompe à Chaleur (PAC)',
    description: 'Tout ce qui concerne les pompes à chaleur',
    children: [
      { name: 'Installation PAC', description: 'Pose et mise en service des PAC' },
      { name: 'Maintenance PAC', description: 'Entretien et suivi des installations PAC' },
      { name: 'PAC air/air', description: 'Pompes à chaleur air/air' },
      { name: 'PAC air/eau', description: 'Pompes à chaleur air/eau' },
      { name: 'Fiches techniques PAC', description: 'Fiches produits et spécifications techniques PAC' },
    ],
  },
  {
    name: 'Commercial',
    description: 'Tarifs, devis, aides financières et contrats',
    children: [
      { name: 'Tarifs & devis PV', description: 'Grilles tarifaires photovoltaïque' },
      { name: 'Tarifs & devis PAC', description: 'Grilles tarifaires pompe à chaleur' },
      { name: 'Aides & subventions', description: 'MaPrimeRénov\', TVA réduite, CEE, etc.' },
      { name: 'Financement & contrats', description: 'Options de financement et modèles de contrats' },
    ],
  },
  {
    name: 'Réglementation',
    description: 'Normes, autorisations et obligations légales',
    children: [
      { name: 'Normes électriques', description: 'NF C 15-100 et normes électriques applicables' },
      { name: 'Urbanisme & autorisations', description: 'Permis, déclarations préalables' },
      { name: 'Raccordement Enedis', description: 'Procédures de raccordement au réseau' },
      { name: 'Normes thermiques (PAC)', description: 'RGE, QualiPAC, normes thermiques' },
    ],
  },
  {
    name: 'SAV & Garanties',
    description: 'Service après-vente, pannes et garanties',
    children: [
      { name: 'Pannes PV', description: 'Diagnostic et résolution des pannes photovoltaïque' },
      { name: 'Pannes PAC', description: 'Diagnostic et résolution des pannes PAC' },
      { name: 'Garanties & réclamations', description: 'Gestion des garanties et réclamations clients' },
    ],
  },
  {
    name: 'Franchise',
    description: 'Documents réservés aux franchisés Le Roi Solaire',
    children: [
      { name: 'Manuel opérationnel', description: 'Procédures et standards opérationnels' },
      { name: 'Charte & identité visuelle', description: 'Charte graphique et règles de communication' },
      { name: 'Formation', description: 'Supports et programmes de formation' },
      { name: 'Redevances & obligations', description: 'Conditions financières et obligations contractuelles' },
    ],
  },
]

async function main() {
  console.log('Suppression des catégories existantes...')
  await db.category.deleteMany()

  console.log('Création des catégories...')
  for (const parent of CATEGORIES) {
    const created = await db.category.create({
      data: { name: parent.name, description: parent.description },
    })
    await db.category.createMany({
      data: parent.children.map((child) => ({ ...child, parentId: created.id })),
    })
    console.log(`✓ ${created.name} (${parent.children.length} sous-catégories)`)
  }

  console.log('\nSeed terminé !')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
