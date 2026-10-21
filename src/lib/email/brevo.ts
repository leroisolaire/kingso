import 'server-only'

// Envoi d'emails transactionnels via l'API Brevo (https://developers.brevo.com/reference/sendtransacemail).
// Variables : BREVO_API_KEY, BREVO_SENDER_EMAIL (adresse d'un expéditeur validé dans Brevo).

export interface EmailMessage {
  to: string[]
  subject: string
  html: string
  replyTo?: { email: string; name?: string }
  attachments?: { name: string; content: string }[] // content en base64
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL)
}

export async function sendEmail(message: EmailMessage): Promise<void> {
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
      sender: { name: 'Kingso — Le Roi Solaire', email: process.env.BREVO_SENDER_EMAIL },
      to: message.to.map((email) => ({ email })),
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
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
