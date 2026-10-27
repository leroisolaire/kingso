import { NextRequest, NextResponse } from 'next/server'
import { resolveAssistant } from '@/lib/assistants/resolve'
import { downloadAttachments } from '@/lib/storage/attachments'
import { sendEmail, escapeHtml } from '@/lib/email/brevo'
import { getClientIp, hashIp } from '@/lib/visitor'
import { db } from '@/lib/db/client'
import { caseFromChatEscalation } from '@/lib/sav/ingest'

export const maxDuration = 30

const MAX_PER_VISITOR_PER_DAY = 3
const MAX_ATTACHMENTS_BYTES = 8_000_000

interface Params {
  params: Promise<{ slug: string }>
}

const clean = (v: unknown, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function validate(body: Record<string, unknown>) {
  const data = {
    sessionToken: clean(body.sessionToken),
    firstName: clean(body.firstName),
    lastName: clean(body.lastName),
    phone: clean(body.phone, 30),
    postalCode: clean(body.postalCode, 10),
    email: clean(body.email, 150) || null,
  }
  const errors: Record<string, string> = {}
  if (!data.firstName) errors.firstName = 'Prénom requis.'
  if (!data.lastName) errors.lastName = 'Nom requis.'
  if (data.phone.replace(/\D/g, '').length < 9) errors.phone = 'Numéro de téléphone invalide.'
  if (!/^\d{4,5}$/.test(data.postalCode)) errors.postalCode = 'Code postal invalide.'
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Email invalide.'
  return { data, errors }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const resolved = await resolveAssistant(slug)
  if (resolved.kind === 'locked') return NextResponse.json({ error: 'Accès protégé.' }, { status: 401 })
  if (resolved.kind !== 'ok' || !resolved.assistant.escalationEnabled) {
    return NextResponse.json({ error: 'Chat introuvable.' }, { status: 404 })
  }
  const { assistant } = resolved

  try {
    const { data, errors } = validate(await request.json())
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'Merci de vérifier le formulaire.', fields: errors }, { status: 400 })
    }

    // La demande doit correspondre à une vraie conversation de ce chat
    const entries = await db.history.findMany({
      where: { sessionToken: data.sessionToken, assistantId: assistant.id },
      orderBy: { createdAt: 'asc' },
    })
    if (!data.sessionToken || entries.length === 0) {
      return NextResponse.json({ error: 'Aucune conversation à transmettre.' }, { status: 400 })
    }

    const ipHash = hashIp(getClientIp(request))
    const recent = await db.escalation.count({
      where: { ipHash, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    })
    if (recent >= MAX_PER_VISITOR_PER_DAY) {
      return NextResponse.json({ error: 'Votre demande a déjà été transmise. Le SAV va revenir vers vous.' }, { status: 429 })
    }

    const escalation = await db.escalation.create({
      data: { ...data, assistantId: assistant.id, ipHash },
    })

    // Dossier dans l'espace SAV (« À rappeler »), avec la conversation rattachée
    await caseFromChatEscalation({
      assistantId: assistant.id,
      sessionToken: data.sessionToken,
      name: `${data.firstName} ${data.lastName}`,
      phone: data.phone,
      postalCode: data.postalCode,
      email: data.email,
      userMessages: entries.map((e) => e.userMessage),
    }).catch((e) => console.error('[escalate] dossier SAV', e instanceof Error ? e.message : e))

    // Email au SAV — en cas d'échec la demande reste visible dans le back-office
    try {
      if (assistant.escalationEmails.length === 0) throw new Error('Aucune adresse de réception configurée pour ce chat.')

      const adminUrl = `${request.nextUrl.origin}/admin/history/${encodeURIComponent(data.sessionToken)}`
      const conversation = entries
        .map((e) => `
          <p style="margin:12px 0 4px;color:#888;font-size:12px">${e.createdAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}${e.attachments.length ? ` · ${e.attachments.length} photo(s)` : ''}</p>
          <p style="margin:0 0 6px;padding:8px 12px;background:#fdeee9;border-radius:8px"><strong>Client :</strong> ${escapeHtml(e.userMessage).replace(/\n/g, '<br>')}</p>
          <p style="margin:0;padding:8px 12px;background:#f4f4f4;border-radius:8px"><strong>Kingso :</strong> ${escapeHtml(e.assistantMessage).replace(/\n/g, '<br>')}</p>`)
        .join('')

      const row = (label: string, value: string) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666">${label}</td><td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td></tr>`

      const allPaths = entries.flatMap((e) => e.attachments)
      const files = await downloadAttachments(allPaths)
      let total = 0
      const attachments = files.filter((f) => (total += f.content.length) <= MAX_ATTACHMENTS_BYTES)

      await sendEmail({
        to: assistant.escalationEmails,
        subject: `Demande SAV — ${data.firstName} ${data.lastName} — ${data.postalCode} (${assistant.name})`,
        replyTo: data.email ? { email: data.email, name: `${data.firstName} ${data.lastName}` } : undefined,
        attachments,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:640px;color:#222">
            <h2 style="color:#e73e11;margin:0 0 12px">Nouvelle demande SAV via Kingso</h2>
            <p style="margin:0 0 12px">Chat : <strong>${escapeHtml(assistant.name)}</strong></p>
            <table style="border-collapse:collapse;margin-bottom:16px">
              ${row('Nom', `${data.firstName} ${data.lastName}`)}
              ${row('Téléphone', data.phone)}
              ${row('Code postal', data.postalCode)}
              ${data.email ? row('Email', data.email) : ''}
            </table>
            ${allPaths.length ? `<p>${attachments.length} photo(s) en pièce jointe.</p>` : ''}
            <p><a href="${adminUrl}" style="color:#e73e11">Voir la conversation dans le back-office</a></p>
            <h3 style="margin:24px 0 4px">Conversation</h3>
            ${conversation}
          </div>`,
      })
      await db.escalation.update({ where: { id: escalation.id }, data: { emailSent: true } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[/api/c/:slug/escalate] email', message)
      await db.escalation.update({ where: { id: escalation.id }, data: { emailError: message.slice(0, 500) } })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/c/:slug/escalate]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 })
  }
}
