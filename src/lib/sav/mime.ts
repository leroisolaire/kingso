// Lecture minimale d'un email brut (fichier .eml, ou message « raw » de l'API Gmail) :
// en-têtes utiles et partie texte, sans dépendance. Suffisant pour les emails Connectel.

export interface ParsedEmail {
  messageId: string | null
  from: string
  subject: string
  text: string
}

function decodeHeader(value: string): string {
  // « =?UTF-8?B?...?= » / « =?UTF-8?Q?...?= »
  return value.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset: string, enc: string, data: string) => {
    const bytes = enc.toUpperCase() === 'B'
      ? Buffer.from(data, 'base64')
      : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1')
    return new TextDecoder(/8859-1|latin/i.test(charset) ? 'latin1' : 'utf-8').decode(bytes)
  }).replace(/\?=\s+=\?/g, '')
}

function splitHead(raw: string): { headers: Record<string, string>; body: string } {
  const idx = raw.search(/\r?\n\r?\n/)
  const head = idx >= 0 ? raw.slice(0, idx) : raw
  const body = idx >= 0 ? raw.slice(idx).replace(/^\r?\n\r?\n/, '') : ''
  const headers: Record<string, string> = {}
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/)
    if (m) headers[m[1].toLowerCase()] = m[2]
  }
  return { headers, body }
}

function decodeBody(body: string, headers: Record<string, string>): string {
  const encoding = (headers['content-transfer-encoding'] ?? '').toLowerCase()
  const charset = headers['content-type']?.match(/charset="?([^";]+)"?/i)?.[1] ?? 'utf-8'
  const decoder = new TextDecoder(/8859-1|latin|windows-1252/i.test(charset) ? 'latin1' : 'utf-8')
  if (encoding === 'base64') return decoder.decode(Buffer.from(body.replace(/\s/g, ''), 'base64'))
  if (encoding === 'quoted-printable') {
    const bytes = Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1')
    return decoder.decode(bytes)
  }
  return body
}

/** Première partie text/plain trouvée (en parcourant les parties multipart). */
function findText(raw: string): string {
  const { headers, body } = splitHead(raw)
  const type = headers['content-type'] ?? 'text/plain'
  const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1]
  if (/^multipart\//i.test(type) && boundary) {
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break
      const text = findText(part.replace(/^\r?\n/, ''))
      if (text) return text
    }
    return ''
  }
  return /^text\/plain/i.test(type) ? decodeBody(body, headers) : ''
}

// ── Lecture complète (emails Kingsia) : en-têtes d'authentification, texte (ou HTML), pièces jointes ──

export interface EmailAttachment { fileName: string; mimeType: string; data: Buffer }

export interface FullEmail extends ParsedEmail {
  /** Adresse seule de l'expéditeur, en minuscules */
  fromAddress: string
  fromName: string
  /** Tous les en-têtes « Authentication-Results » (ajoutés par Gmail à la réception) */
  authResults: string[]
  attachments: EmailAttachment[]
}

/** Valeur d'un paramètre d'en-tête : name="…", name*=UTF-8''…, avec les mots encodés =?…?=. */
function headerParam(value: string, name: string): string | null {
  const star = value.match(new RegExp(`${name}\\*=(?:([\\w-]+)'[^']*')?([^;]+)`, 'i'))
  if (star) {
    try { return decodeURIComponent(star[2].trim().replace(/^"|"$/g, '')) } catch { return star[2].trim() }
  }
  const plain = value.match(new RegExp(`${name}="([^"]*)"|${name}=([^;\\s]+)`, 'i'))
  return plain ? decodeHeader(plain[1] ?? plain[2]) : null
}

function decodeBytes(body: string, headers: Record<string, string>): Buffer {
  const encoding = (headers['content-transfer-encoding'] ?? '').toLowerCase()
  if (encoding === 'base64') return Buffer.from(body.replace(/\s/g, ''), 'base64')
  if (encoding === 'quoted-printable') {
    return Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1')
  }
  return Buffer.from(body, 'latin1')
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, '\'').replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function walk(raw: string, out: { text: string; html: string; attachments: EmailAttachment[] }) {
  const { headers, body } = splitHead(raw)
  const type = headers['content-type'] ?? 'text/plain'
  const boundary = headerParam(type, 'boundary')
  if (/^multipart\//i.test(type) && boundary) {
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break
      walk(part.replace(/^\r?\n/, ''), out)
    }
    return
  }
  const disposition = headers['content-disposition'] ?? ''
  const fileName = headerParam(disposition, 'filename') ?? headerParam(type, 'name')
  if (fileName || /^attachment/i.test(disposition)) {
    out.attachments.push({ fileName: fileName ?? 'piece-jointe', mimeType: type.split(';')[0].trim().toLowerCase(), data: decodeBytes(body, headers) })
    return
  }
  if (/^text\/plain/i.test(type) && !out.text) out.text = decodeBody(body, headers)
  else if (/^text\/html/i.test(type) && !out.html) out.html = decodeBody(body, headers)
}

/** Lecture complète d'un email brut (chaîne « latin1 » des octets du message). */
export function parseFullEmail(raw: string): FullEmail {
  const { headers } = splitHead(raw)
  const head = raw.slice(0, Math.max(0, raw.search(/\r?\n\r?\n/))).replace(/\r?\n[ \t]+/g, ' ')
  const authResults = [...head.matchAll(/^Authentication-Results:\s*(.*)$/gim)].map((m) => m[1])
  const from = decodeHeader(headers.from ?? '')
  const fromAddress = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase()
  const fromName = from.replace(/<[^>]*>/, '').replace(/"/g, '').trim()
  const out = { text: '', html: '', attachments: [] as EmailAttachment[] }
  walk(raw, out)
  return {
    messageId: headers['message-id']?.trim() ?? null,
    from,
    fromAddress,
    fromName: fromName && fromName.toLowerCase() !== fromAddress ? fromName : '',
    subject: decodeHeader(headers.subject ?? ''),
    text: out.text || htmlToText(out.html),
    authResults,
    attachments: out.attachments,
  }
}

export function parseRawEmail(raw: string): ParsedEmail {
  const { headers } = splitHead(raw)
  return {
    messageId: headers['message-id']?.trim() ?? null,
    from: decodeHeader(headers.from ?? ''),
    subject: decodeHeader(headers.subject ?? ''),
    text: findText(raw),
  }
}
