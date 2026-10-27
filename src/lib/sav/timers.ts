import 'server-only'
import { db } from '@/lib/db/client'
import { addSavEvent } from './events'
import { getSavSettings } from './settings'

/**
 * Passages automatiques en « À rappeler » (appelé à l'ouverture du back-office SAV, pas besoin de tâche planifiée) :
 *  - email parti mais lien jamais ouvert : après 4 h sans chauffage / eau chaude, 24 h sinon ;
 *  - conversation commencée avec Kingso mais ni résolue ni relancée depuis 24 h.
 */
export async function refreshSavTimers(): Promise<number> {
  const s = await getSavSettings()
  const now = Date.now()
  let moved = 0

  const waiting = await db.savCase.findMany({
    where: { status: 'WAITING', chatOpenedAt: null, emailSentAt: { not: null } },
    select: { id: true, emailSentAt: true, noHeating: true },
  })
  for (const c of waiting) {
    const hours = c.noHeating ? s.noClickHoursUrgent : s.noClickHours
    if (now - c.emailSentAt!.getTime() < hours * 3600_000) continue
    const { count } = await db.savCase.updateMany({ where: { id: c.id, status: 'WAITING' }, data: { status: 'TO_CALL' } })
    if (count) {
      moved++
      await addSavEvent(c.id, 'NO_CLICK', `Lien non ouvert ${hours} h après l'email : à rappeler`)
    }
  }

  const chatting = await db.savCase.findMany({
    where: { status: 'IN_CHAT', chatSessionToken: { not: null } },
    select: { id: true, chatSessionToken: true, chatOpenedAt: true },
  })
  for (const c of chatting) {
    const last = await db.history.findFirst({
      where: { sessionToken: c.chatSessionToken! },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const lastActivity = last?.createdAt ?? c.chatOpenedAt
    if (!lastActivity || now - lastActivity.getTime() < s.noClickHours * 3600_000) continue
    const { count } = await db.savCase.updateMany({ where: { id: c.id, status: 'IN_CHAT' }, data: { status: 'TO_CALL' } })
    if (count) {
      moved++
      await addSavEvent(c.id, 'NO_NEWS', `Pas de nouvelles du client depuis ${s.noClickHours} h : à rappeler`)
    }
  }
  return moved
}
