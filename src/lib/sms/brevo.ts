import 'server-only'

// Envoi de SMS transactionnels via l'API Brevo (https://developers.brevo.com/reference/sendtransacsms).
// Même clé que les emails (BREVO_API_KEY) ; les crédits SMS s'achètent dans Brevo.

export function isSmsConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY)
}

/** Envoie un SMS. `recipient` au format international (+33612345678). */
export async function sendSms(params: { sender: string; recipient: string; content: string; unicode: boolean; tag?: string }): Promise<{ messageId: string | null; credits: number | null }> {
  if (!isSmsConfigured()) throw new Error('Brevo non configuré (BREVO_API_KEY manquante).')
  const response = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      type: 'transactional',
      sender: params.sender,
      recipient: params.recipient.replace(/^\+/, ''),
      content: params.content,
      unicodeEnabled: params.unicode,
      ...(params.tag ? { tag: params.tag } : {}),
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    if (response.status === 402 || /credit/i.test(body)) throw new Error('Crédits SMS insuffisants dans Brevo.')
    throw new Error(`Brevo SMS ${response.status} : ${body.slice(0, 300)}`)
  }
  const data = await response.json().catch(() => ({}))
  return { messageId: data.messageId != null ? String(data.messageId) : null, credits: typeof data.remainingCredits === 'number' ? data.remainingCredits : null }
}
