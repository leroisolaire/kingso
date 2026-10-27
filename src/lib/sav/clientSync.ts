import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { downloadSpreadsheet, isSpreadsheet, listChildren } from '@/lib/drive/google'
import { importClientsFromXlsx, type ImportResult } from './clientImport'
import { findClient } from './clients'
import { addSavEvent } from './events'
import { prepareEmail } from './ingest'
import { getSavSettings } from './settings'
import type { TemplateKey } from './templates'

// Fichier client déposé dans un dossier Drive à part (« Kingso - Clients », hors base documentaire) :
// relu automatiquement dès qu'une nouvelle version apparaît (à chaque message reçu et chaque nuit).

const STATE_KEY = 'savClientFile'

export interface ClientFileState {
  fileId?: string
  fileName?: string
  modifiedTime?: string
  importedAt?: string
  result?: ImportResult
  rematched?: number
  error?: string | null
  checkedAt?: string
}

export async function getClientFileState(): Promise<ClientFileState> {
  const row = await db.appSetting.findUnique({ where: { key: STATE_KEY } })
  return (row?.value as ClientFileState | null) ?? {}
}

async function saveState(state: ClientFileState) {
  const value = state as unknown as Prisma.InputJsonValue
  await db.appSetting.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, value }, update: { value } })
}

/**
 * Importe le fichier client le plus récent du dossier s'il a changé (ou toujours avec `force`),
 * puis complète les dossiers SAV ouverts dont le client n'était pas encore identifié.
 */
export async function syncClientFile(force = false): Promise<ClientFileState & { status: 'not-configured' | 'unchanged' | 'imported' | 'error' }> {
  const { clientFolderId } = await getSavSettings()
  const state = await getClientFileState()
  if (!clientFolderId) return { ...state, status: 'not-configured' }

  try {
    const files = (await listChildren(clientFolderId)).filter(isSpreadsheet)
    const latest = files.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0]
    if (!latest) throw new Error('Aucun fichier Excel dans le dossier client.')
    if (!force && state.fileId === latest.id && state.modifiedTime === latest.modifiedTime && !state.error) {
      return { ...state, status: 'unchanged' }
    }
    const result = await importClientsFromXlsx(await downloadSpreadsheet(latest))
    const rematched = await rematchOpenCases()
    const next: ClientFileState = {
      fileId: latest.id, fileName: latest.name, modifiedTime: latest.modifiedTime,
      importedAt: new Date().toISOString(), result, rematched, error: null, checkedAt: new Date().toISOString(),
    }
    await saveState(next)
    return { ...next, status: 'imported' }
  } catch (error) {
    const next = { ...state, error: error instanceof Error ? error.message : String(error), checkedAt: new Date().toISOString() }
    await saveState(next)
    return { ...next, status: 'error' }
  }
}

/** Dossiers ouverts sans client identifié : nouvelle recherche après un import du fichier client. */
export async function rematchOpenCases(): Promise<number> {
  const cases = await db.savCase.findMany({
    where: { clientId: null, phoneKey: { not: null }, status: { notIn: ['RESOLVED', 'CLOSED'] } },
  })
  let found = 0
  for (const c of cases) {
    const { client, match } = await findClient([c.phoneKey, c.callbackPhone], c.city)
    if (!client) continue
    found++
    await db.savCase.update({
      where: { id: c.id },
      data: {
        clientId: client.id,
        clientMatch: match,
        customerName: client.name,
        email: c.email ?? client.email,
        address: client.address ?? c.address,
        postalCode: client.postalCode ?? c.postalCode,
        city: client.city ?? c.city,
        equipment: c.equipment ?? client.equipment,
      },
    })
    await addSavEvent(c.id, 'CLIENT_FOUND', `${match} (fichier client mis à jour)`)
    // Email pas encore parti : refait avec la bonne formule de politesse ; « Kingso peut aider » repasse à valider
    if (c.emailTemplate && !c.emailSentAt && (c.email ?? client.email)) {
      await prepareEmail(c.id, c.emailTemplate as TemplateKey)
      if (c.emailTemplate === 'SELF_HELP' && c.status === 'TO_CALL') {
        await db.savCase.update({ where: { id: c.id }, data: { status: 'NEW' } })
      }
    }
  }
  return found
}
