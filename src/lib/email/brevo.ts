import 'server-only'

// Envoi d'emails transactionnels via l'API Brevo (https://developers.brevo.com/reference/sendtransacemail).
// Variables : BREVO_API_KEY, BREVO_SENDER_EMAIL (adresse d'un expéditeur validé dans Brevo).

export interface EmailMessage {
  to: string[]
  subject: string
  html: string
  replyTo?: { email: string; name?: string }
  attachments?: { name: string; content: string }[] // content en base64
  /** Expéditeur (validé dans Brevo) ; par défaut BREVO_SENDER_EMAIL */
  from?: { email: string; name: string }
  bcc?: string[]
  /** Envoi programmé (ISO 8601), géré par Brevo */
  scheduledAt?: string
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL)
}

/** Envoie l'email (ou le confie à Brevo pour un envoi programmé) ; renvoie son identifiant Brevo. */
export async function sendEmail(message: EmailMessage): Promise<{ messageId: string | null }> {
  if (!isEmailConfigured()) {
    throw new Error('Brevo non configuré (BREVO_API_KEY / BREVO_SENDER_EMAIL manquants).')
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: message.from ?? { name: 'Kingso — Le Roi Solaire', email: process.env.BREVO_SENDER_EMAIL },
      to: message.to.map((email) => ({ email })),
      ...(message.bcc?.length ? { bcc: message.bcc.map((email) => ({ email })) } : {}),
      ...(message.scheduledAt ? { scheduledAt: message.scheduledAt } : {}),
      subject: message.subject,
      htmlContent: message.html,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.attachments?.length ? { attachment: message.attachments } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Brevo ${response.status} : ${body.slice(0, 300)}`)
  }
  const data = await response.json().catch(() => ({}))
  return { messageId: data.messageId ?? data.messageIds?.[0] ?? null }
}

/** Annule un email programmé qui n'est pas encore parti. */
export async function cancelScheduledEmail(messageId: string): Promise<void> {
  const response = await fetch(`https://api.brevo.com/v3/smtp/email/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
    headers: { 'api-key': process.env.BREVO_API_KEY ?? '', accept: 'application/json' },
  })
  if (!response.ok && response.status !== 404) {
    const body = await response.text().catch(() => '')
    throw new Error(`Brevo ${response.status} : ${body.slice(0, 300)}`)
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
