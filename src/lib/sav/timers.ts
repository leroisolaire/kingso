import 'server-only'
import { db } from '@/lib/db/client'
import { addSavEvent } from './events'
import { formatParisDate } from './schedule'
import { getSavSettings } from './settings'

/**
 * Passages automatiques en « À rappeler » (appelé à l'ouverture du back-office SAV, pas besoin de tâche planifiée) :
 *  - email parti mais lien jamais ouvert : après 4 h sans chauffage / eau chaude, 24 h sinon ;
 *  - client parti de son chat (« Avec Kingso ») sans conclure depuis quelques minutes (réglable, 30 min).
 */
export async function refreshSavTimers(): Promise<number> {
  const s = await getSavSettings()
  const now = Date.now()
  let moved = 0

  const waiting = await db.savCase.findMany({
    where: { status: 'WAITING', linkOpenedAt: null, chatOpenedAt: null, emailSentAt: { not: null } },
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

  // Client parti de son chat (plus de signal ni de message) sans « résolu » ni « être rappelé »
  const chatting = await db.savCase.findMany({
    where: { status: 'IN_CHAT' },
    select: { id: true, chatSessionToken: true, chatOpenedAt: true, linkOpenedAt: true, lastSeenAt: true },
  })
  for (const c of chatting) {
    const [last, messages] = c.chatSessionToken
      ? await Promise.all([
          db.history.findFirst({ where: { sessionToken: c.chatSessionToken }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
          db.history.count({ where: { sessionToken: c.chatSessionToken } }),
        ])
      : [null, 0]
    const times = [c.lastSeenAt, last?.createdAt, c.chatOpenedAt, c.linkOpenedAt].filter((d): d is Date => Boolean(d)).map((d) => d.getTime())
    if (times.length === 0) continue
    const lastActivity = Math.max(...times)
    if (now - lastActivity < s.chatAwayMinutes * 60_000) continue
    const { count } = await db.savCase.updateMany({ where: { id: c.id, status: 'IN_CHAT' }, data: { status: 'TO_CALL' } })
    if (count) {
      moved++
      const opened = c.linkOpenedAt ?? c.chatOpenedAt
      const detail = [
        opened ? `Lien ouvert le ${formatParisDate(opened, true)}` : null,
        messages ? `${messages} message(s) échangé(s) avec Kingso` : 'aucun message écrit',
        `parti vers ${formatParisDate(new Date(lastActivity), true)} sans indiquer si c'est résolu : à rappeler`,
      ].filter(Boolean).join(', ')
      await addSavEvent(c.id, 'CLIENT_LEFT', detail)
    }
  }
  return moved
}
