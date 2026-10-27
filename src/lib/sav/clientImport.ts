import 'server-only'
import { Prisma } from '@prisma/client'
import { readSheet } from 'read-excel-file/node'
import { db } from '@/lib/db/client'
import { normalizePhone } from './phone'

// Import du fichier client (export « clients » d'Extrabat, .xlsx). On ne garde que ce qui sert au SAV :
// identifiant, civilité, nom, prénom, téléphones, email, adresse, ouvrages. Les colonnes de texte libre
// (Observations, Historique…), la comptabilité et le commercial ne sont jamais lues.

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const COLUMNS = {
  id: ['idclient'],
  civility: ['civilite'],
  lastName: ['nom'],
  firstName: ['prenom'],
  phones: ['telephone', 'portable', 'telephoneducontact', 'portableducontact', 'professionnel'],
  email: ['email'],
  address: ['adressecorresp'],
  postalCode: ['cpcorresp'],
  city: ['villecorresp'],
  siteAddress: ['adressechantier'],
  sitePostalCode: ['cpchantier'],
  siteCity: ['villechantier'],
  works: ['ouvrages'],
} as const

/** Ouvrages qui ne décrivent pas un équipement */
const NOT_EQUIPMENT = ['entretien', 'divers', 'existant', 'serviceapresvente']
/** Code postal lu comme un nombre dans Excel : 7700 → « 07700 » */
const postal = (v: string) => (/^\d{4,5}$/.test(v) ? v.padStart(5, '0') : v || null)

const PERSON_CIVILITIES = /^(m\.?|mme|mlle|m\. et mme|mr|monsieur|madame)$/i

export interface ImportResult {
  rows: number
  imported: number
  skipped: number
  removed: number
}

/** Lecture du fichier (sans rien enregistrer). */
export async function parseClientsXlsx(buffer: Buffer): Promise<{ clients: Prisma.SavClientCreateManyInput[]; rows: number; skipped: number }> {
  const sheet = await readSheet(buffer)
  const headerIndex = sheet.findIndex((r) => r.filter((c) => c !== null && c !== '').length >= 3)
  if (headerIndex < 0) throw new Error('Fichier vide ou sans ligne d\'en-tête.')
  const header = sheet[headerIndex].map(norm)
  const idx = (names: readonly string[]) => names.map((n) => header.indexOf(n)).filter((i) => i >= 0)
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, idx(names)])) as Record<keyof typeof COLUMNS, number[]>
  if (!col.id.length || !col.lastName.length) throw new Error('Colonnes « ID Client » et « Nom » introuvables : est-ce bien l\'export clients d\'Extrabat ?')

  const cell = (row: unknown[], key: keyof typeof COLUMNS) => {
    const v = row[col[key][0]]
    return v === null || v === undefined ? '' : String(v).trim()
  }

  const clients: Prisma.SavClientCreateManyInput[] = []
  let skipped = 0
  for (const row of sheet.slice(headerIndex + 1)) {
    const externalId = cell(row, 'id')
    const lastName = cell(row, 'lastName')
    if (!externalId || !lastName) { skipped++; continue }
    const civility = cell(row, 'civility')
    const firstName = cell(row, 'firstName')
    // Nom tel qu'il est dans Extrabat (« M. et Mme DUPONT Jean ») ; pas de civilité pour une société (SCI, SARL…)
    const name = [PERSON_CIVILITIES.test(civility) ? civility : '', lastName, firstName]
      .filter(Boolean).join(' ')
    const phones = [...new Set(col.phones.map((i) => normalizePhone(String(row[i] ?? ''))).filter((p): p is string => Boolean(p)))]
    // Adresse du chantier si elle existe (là où est l'installation), sinon adresse de correspondance
    const site = cell(row, 'siteAddress')
    const works = cell(row, 'works')
    clients.push({
      externalId,
      name,
      phones,
      email: cell(row, 'email').toLowerCase() || null,
      address: site || cell(row, 'address') || null,
      postalCode: postal(site ? cell(row, 'sitePostalCode') : cell(row, 'postalCode')),
      city: (site ? cell(row, 'siteCity') : cell(row, 'city')) || null,
      equipment: works && !NOT_EQUIPMENT.includes(norm(works)) ? works : null,
      contract: /entretien/i.test(works) ? 'Entretien' : null,
    })
  }
  if (clients.length === 0) throw new Error('Aucun client lisible dans le fichier.')
  return { clients, rows: sheet.length - headerIndex - 1, skipped }
}

export async function importClientsFromXlsx(buffer: Buffer): Promise<ImportResult> {
  const { clients, rows, skipped } = await parseClientsXlsx(buffer)

  // Remplacement complet : mise à jour par lots, puis retrait des clients absents du nouveau fichier
  const now = new Date()
  for (let i = 0; i < clients.length; i += 500) {
    const batch = clients.slice(i, i + 500)
    await db.$executeRaw`
      INSERT INTO "SavClient" ("id", "externalId", "name", "phones", "email", "address", "postalCode", "city", "equipment", "contract", "importedAt")
      VALUES ${Prisma.join(batch.map((c) => Prisma.sql`(
        ${`cli_${c.externalId}`}, ${c.externalId}, ${c.name}, ${c.phones as string[]}::text[], ${c.email}, ${c.address},
        ${c.postalCode}, ${c.city}, ${c.equipment}, ${c.contract}, ${now})`))}
      ON CONFLICT ("externalId") DO UPDATE SET
        "name" = EXCLUDED."name", "phones" = EXCLUDED."phones", "email" = EXCLUDED."email", "address" = EXCLUDED."address",
        "postalCode" = EXCLUDED."postalCode", "city" = EXCLUDED."city", "equipment" = EXCLUDED."equipment",
        "contract" = EXCLUDED."contract", "importedAt" = EXCLUDED."importedAt"
    `
  }
  const { count: removed } = await db.savClient.deleteMany({ where: { importedAt: { lt: now } } })
  return { rows, imported: clients.length, skipped, removed }
}
